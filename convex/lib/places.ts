import { env } from '../_generated/server';

/**
 * Nearby places for a location check-in, from Google Places API (New) Nearby
 * Search: the close circle first, and the large-area search only when that
 * doesn't settle it (`locationProofs.analyze`), so most check-ins cost one call.
 * The field mask stays within the Nearby Search Pro SKU (names, types,
 * coordinates, short address): nothing here needs ratings or hours.
 *
 * Google's terms allow keeping place IDs but not the other fields, so results
 * are only passed to the model and never stored.
 */

const NEARBY_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.primaryType',
  'places.types',
  'places.location',
  'places.shortFormattedAddress',
].join(',');

/** Google's maximum for one Nearby Search page. */
const MAX_RESULTS = 20;

/** A tight circle still gives a fix with poor accuracy a fair chance, within limits. */
const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 250;
const RADIUS_SLACK_M = 75;

const REQUEST_TIMEOUT_MS = 8000;

export type Coords = { latitude: number; longitude: number; accuracy: number };

export type NearbyPlace = {
  id: string;
  name: string;
  primaryType: string | null;
  types: string[];
  address: string | null;
  distanceM: number;
  /** From the wider search: a park or campus, listed at its centre. */
  largeArea?: boolean;
};

export function searchRadius(accuracy: number): number {
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(accuracy + RADIUS_SLACK_M)));
}

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  primaryType?: string;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  shortFormattedAddress?: string;
};

/**
 * Places whose listed point can be far from where someone actually is in
 * them: Google lists a park or a campus at its centre, so the tight circle
 * above would never include it. These get a second, wider search.
 */
const LARGE_AREA_TYPES = [
  'park',
  'national_park',
  'hiking_area',
  'university',
  'stadium',
  'golf_course',
  'campground',
  'zoo',
  'amusement_park',
  'sports_complex',
];
const LARGE_AREA_RADIUS_M = 1500;
const LARGE_AREA_RESULTS = 10;

function requireKey(): string {
  const apiKey = env.GOOGLE_PLACES_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error('GOOGLE_PLACES_API_KEY is not set on this deployment');
  }
  return apiKey;
}

/** Everything labeled right around the user, closest first. */
export async function searchClose(coords: Coords): Promise<NearbyPlace[]> {
  const center = { latitude: coords.latitude, longitude: coords.longitude };
  return await nearbySearch(requireKey(), coords, {
    maxResultCount: MAX_RESULTS,
    rankPreference: 'DISTANCE',
    locationRestriction: { circle: { center, radius: searchRadius(coords.accuracy) } },
  });
}

/** Large areas (park, campus) the user could be inside, though their listed centre is far off. */
export async function searchLargeAreas(coords: Coords): Promise<NearbyPlace[]> {
  const center = { latitude: coords.latitude, longitude: coords.longitude };
  const places = await nearbySearch(requireKey(), coords, {
    includedTypes: LARGE_AREA_TYPES,
    maxResultCount: LARGE_AREA_RESULTS,
    rankPreference: 'DISTANCE',
    locationRestriction: { circle: { center, radius: LARGE_AREA_RADIUS_M } },
  });
  return places.map((place) => ({ ...place, largeArea: true }));
}

/**
 * The close places plus any large area not already among them, closest first
 * so the model (and the reason it writes) sees the likeliest match on top.
 */
export function withLargeAreas(close: NearbyPlace[], large: NearbyPlace[]): NearbyPlace[] {
  const byId = new Map<string, NearbyPlace>();
  for (const place of close) byId.set(place.id, place);
  for (const place of large) if (!byId.has(place.id)) byId.set(place.id, place);
  return [...byId.values()].sort((a, b) => a.distanceM - b.distanceM);
}

async function nearbySearch(
  apiKey: string,
  coords: Coords,
  request: object,
): Promise<NearbyPlace[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(NEARBY_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`Nearby Search failed with ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as { places?: RawPlace[] };
  const places: NearbyPlace[] = [];
  for (const raw of body.places ?? []) {
    const name = raw.displayName?.text;
    const lat = raw.location?.latitude;
    const lng = raw.location?.longitude;
    if (raw.id === undefined || name === undefined || lat === undefined || lng === undefined) {
      continue;
    }
    places.push({
      id: raw.id,
      name,
      primaryType: raw.primaryType ?? null,
      types: raw.types ?? [],
      address: raw.shortFormattedAddress ?? null,
      distanceM: Math.round(distanceMeters(coords, { latitude: lat, longitude: lng })),
    });
  }
  return places;
}

const EARTH_RADIUS_M = 6_371_000;

/** Haversine; plenty accurate over a few hundred metres. */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
