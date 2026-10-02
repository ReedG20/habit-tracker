import { v } from 'convex/values';

/**
 * Where a proof photo came from, as the app reports it. `camera` is Ante's own
 * camera, so the shot was taken moments before upload. `library` is a photo
 * picked from the camera roll; `takenAt` and `device` come from its EXIF, and
 * a library photo without them (a screenshot, a saved image, a photo someone
 * sent) still goes to the model, flagged. All of it is client-reported, so it
 * steers the model's scrutiny rather than proving anything.
 */
export const photoOriginValidator = v.object({
  source: v.union(v.literal('camera'), v.literal('library')),
  /** EXIF DateTimeOriginal as a timestamp. */
  takenAt: v.optional(v.number()),
  /** EXIF Make and Model, e.g. "Apple iPhone 15 Pro". */
  device: v.optional(v.string()),
});

export type PhotoOrigin = typeof photoOriginValidator.type;

/** Room for the phone's clock to disagree with ours. */
export const PHOTO_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Device names come from EXIF, so they are capped before reaching the prompt. */
export const MAX_DEVICE_LENGTH = 80;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(takenAt: number, now: number): string {
  const elapsed = now - takenAt;
  if (elapsed < 2 * MINUTE) return 'moments ago';
  if (elapsed < HOUR) return `${Math.round(elapsed / MINUTE)} minutes ago`;
  if (elapsed < 2 * HOUR) return 'an hour ago';
  if (elapsed < DAY) return `${Math.round(elapsed / HOUR)} hours ago`;
  if (elapsed < 2 * DAY) return 'a day ago';
  return `${Math.round(elapsed / DAY)} days ago`;
}

function describeOne(origin: PhotoOrigin, now: number): string {
  if (origin.source === 'camera') return 'taken with the in-app camera moments ago.';

  if (origin.takenAt === undefined && origin.device === undefined) {
    return 'picked from the photo library with no camera metadata, so it may be a screenshot, a saved or downloaded image, or a photo someone else sent.';
  }

  const facts = [
    origin.device !== undefined ? origin.device : undefined,
    origin.takenAt !== undefined ? `taken ${ago(origin.takenAt, now)}` : 'no time taken',
  ].filter((fact) => fact !== undefined);
  return `picked from the photo library; camera metadata says ${facts.join(', ')}.`;
}

/**
 * One line per photo for the model's user turn, in upload order. The system
 * prompts tell the model how much to trust each kind.
 */
export function describePhotoOrigins(origins: PhotoOrigin[] | undefined, now: number): string {
  if (origins === undefined || origins.length === 0) {
    return 'Where the photos came from was not reported.';
  }
  return origins
    .map((origin, index) => `Photo ${index + 1}: ${describeOne(origin, now)}`)
    .join('\n');
}

/** Trims a client-reported origin to what the prompt can safely carry. */
export function cleanPhotoOrigin(origin: PhotoOrigin): PhotoOrigin {
  if (origin.source === 'camera') return { source: 'camera' };

  const device = origin.device?.trim().slice(0, MAX_DEVICE_LENGTH);
  return {
    source: 'library',
    ...(origin.takenAt !== undefined && { takenAt: origin.takenAt }),
    ...(device !== undefined && device.length > 0 && { device }),
  };
}
