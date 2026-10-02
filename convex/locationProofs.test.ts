import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { distanceMeters, searchRadius } from './lib/places';
import { grantPro, setup as baseSetup, type Harness } from './test.helpers';

const judgeText = vi.hoisted(() => vi.fn());
vi.mock('./lib/vision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/vision')>()),
  judgeText,
}));

const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

// A spot in Gowanus, Brooklyn.
const HERE = { latitude: 40.6745, longitude: -73.9903, accuracy: 20 };

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

async function signIn(t: Harness, tokenIdentifier: string) {
  const as = t.withIdentity({ tokenIdentifier, name: tokenIdentifier });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  return { as, userId };
}

async function locationHabit(as: Awaited<ReturnType<typeof signIn>>['as']) {
  return await as.mutation(api.habits.create, {
    title: 'Climb',
    description: 'Any climbing gym',
    proofMethod: 'location',
    stake: { kind: 'none' },
  });
}

const fetchMock = vi.fn();

function placesResponse(places: object[]) {
  return new Response(JSON.stringify({ places }), { status: 200 });
}

const GYM = {
  id: 'place_gym',
  displayName: { text: 'Movement Gowanus' },
  primaryType: 'climbing_gym',
  types: ['climbing_gym', 'gym', 'point_of_interest'],
  location: { latitude: 40.6746, longitude: -73.9904 },
  shortFormattedAddress: '151 3rd St',
};

async function verification(t: Harness, id: Id<'habitVerifications'>) {
  return await t.run(async (ctx) => await ctx.db.get('habitVerifications', id));
}

async function completion(t: Harness, habitId: Id<'habits'>) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query('habitCompletions')
        .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId).eq('day', '2026-09-21'))
        .unique(),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21'));
  vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  judgeText.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('submitting a check-in', () => {
  test('records a pending location row', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await locationHabit(alice.as);

    const id = await alice.as.mutation(api.locationProofs.submit, {
      habitId,
      day: '2026-09-21',
      ...HERE,
    });
    expect(await verification(t, id)).toMatchObject({
      method: 'location',
      status: 'pending',
      coords: HERE,
    });
    expect(await alice.as.query(api.verifications.get, { verificationId: id })).toEqual({
      status: 'pending',
      reason: undefined,
      method: 'location',
    });
  });

  test('refuses a fix too rough to tell places apart', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await locationHabit(alice.as);

    await expect(
      alice.as.mutation(api.locationProofs.submit, {
        habitId,
        day: '2026-09-21',
        ...HERE,
        accuracy: 3000,
      }),
    ).rejects.toThrow('Turn on Precise Location');
  });

  test('refuses a second check while one is pending, and photo habits entirely', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await locationHabit(alice.as);
    await alice.as.mutation(api.locationProofs.submit, { habitId, day: '2026-09-21', ...HERE });

    await expect(
      alice.as.mutation(api.locationProofs.submit, { habitId, day: '2026-09-21', ...HERE }),
    ).rejects.toThrow('A check for this habit is already running');

    const photoHabit = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'none' },
    });
    await expect(
      alice.as.mutation(api.locationProofs.submit, {
        habitId: photoHabit,
        day: '2026-09-21',
        ...HERE,
      }),
    ).rejects.toThrow('This habit is proved another way');
  });

  test('is rate limited', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await locationHabit(alice.as);

    for (let i = 0; i < 6; i += 1) {
      const id = await alice.as.mutation(api.locationProofs.submit, {
        habitId,
        day: '2026-09-21',
        ...HERE,
      });
      await t.mutation(internal.verifications.resolve, {
        verificationId: id,
        status: 'rejected',
        reason: 'Not here',
      });
    }
    await expect(
      alice.as.mutation(api.locationProofs.submit, { habitId, day: '2026-09-21', ...HERE }),
    ).rejects.toThrow('That’s a lot of check-ins');
  });

  test('other people can’t watch the row', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const habitId = await locationHabit(alice.as);
    const id = await alice.as.mutation(api.locationProofs.submit, {
      habitId,
      day: '2026-09-21',
      ...HERE,
    });

    expect(await bob.as.query(api.verifications.get, { verificationId: id })).toBeNull();
  });
});

describe('analyzing a check-in', () => {
  async function submitted(t: Harness) {
    const alice = await signIn(t, 'alice');
    const habitId = await locationHabit(alice.as);
    const id = await alice.as.mutation(api.locationProofs.submit, {
      habitId,
      day: '2026-09-21',
      ...HERE,
    });
    return { habitId, id };
  }

  test('a matching place logs the day and keeps only its id', async () => {
    const t = setup();
    const { habitId, id } = await submitted(t);
    fetchMock.mockImplementation(async () => placesResponse([GYM]));
    judgeText.mockResolvedValue({
      verdict: 'approve',
      reason: 'You’re at Movement Gowanus.',
      placeId: 'place_gym',
    });

    await t.action(internal.locationProofs.analyze, {
      verificationId: id,
      coords: HERE,
      title: 'Climb',
      description: 'Any climbing gym',
    });

    // A match in the close circle never pays for the wider search.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(init.headers).toMatchObject({ 'X-Goog-Api-Key': 'test-key' });
    const prompt = (judgeText.mock.calls[0][0] as { text: string }).text;
    expect(prompt).toContain('[id: place_gym] Movement Gowanus | climbing_gym, gym');

    expect(await verification(t, id)).toMatchObject({ status: 'approved', placeId: 'place_gym' });
    expect(await completion(t, habitId)).not.toBeNull();
  });

  test('a miss in the close circle tries the wider search, where a park is marked as a large area', async () => {
    const t = setup();
    const { id } = await submitted(t);
    const PARK = {
      ...GYM,
      id: 'place_park',
      displayName: { text: 'Prospect Park' },
      primaryType: 'park',
      types: ['park'],
    };
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { includedTypes?: string[] };
      return placesResponse(body.includedTypes === undefined ? [GYM] : [PARK, GYM]);
    });
    judgeText
      .mockResolvedValueOnce({ verdict: 'reject', reason: 'Not a park.', placeId: null })
      .mockResolvedValueOnce({
        verdict: 'approve',
        reason: 'You’re in Prospect Park.',
        placeId: 'place_park',
      });

    await t.action(internal.locationProofs.analyze, {
      verificationId: id,
      coords: HERE,
      title: 'Run in the park',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(judgeText).toHaveBeenCalledTimes(2);
    const prompt = (judgeText.mock.calls[1][0] as { text: string }).text;
    expect(prompt).toContain('Prospect Park | park');
    expect(prompt).toContain('large area, listed at its centre');
    // The gym came back from both searches but is listed once.
    expect(prompt.match(/Movement Gowanus/g)).toHaveLength(1);
    expect(await verification(t, id)).toMatchObject({ status: 'approved', placeId: 'place_park' });
  });

  test('a wider search with nothing new keeps the close verdict without asking again', async () => {
    const t = setup();
    const { id } = await submitted(t);
    fetchMock.mockImplementation(async () => placesResponse([GYM]));
    judgeText.mockResolvedValue({ verdict: 'reject', reason: 'Not a library.', placeId: null });

    await t.action(internal.locationProofs.analyze, {
      verificationId: id,
      coords: HERE,
      title: 'Read at the library',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(judgeText).toHaveBeenCalledTimes(1);
    expect(await verification(t, id)).toMatchObject({
      status: 'rejected',
      reason: 'Not a library.',
    });
  });

  test('a failed wider search leaves the close verdict standing', async () => {
    const t = setup();
    const { id } = await submitted(t);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { includedTypes?: string[] };
      return body.includedTypes === undefined
        ? placesResponse([GYM])
        : new Response('bad type', { status: 400 });
    });
    judgeText.mockResolvedValue({ verdict: 'reject', reason: 'Not a park.', placeId: null });

    await t.action(internal.locationProofs.analyze, {
      verificationId: id,
      coords: HERE,
      title: 'Run in the park',
    });

    expect(await verification(t, id)).toMatchObject({ status: 'rejected', reason: 'Not a park.' });
  });

  test('refuses coordinates that aren’t numbers', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await locationHabit(alice.as);

    await expect(
      alice.as.mutation(api.locationProofs.submit, {
        habitId,
        day: '2026-09-21',
        ...HERE,
        latitude: Number.NaN,
      }),
    ).rejects.toThrow('That location doesn’t look right');
  });

  test('no match is a rejection, and an id Google never returned is dropped', async () => {
    const t = setup();
    const { habitId, id } = await submitted(t);
    fetchMock.mockImplementation(async () =>
      placesResponse([{ ...GYM, displayName: { text: 'Starbucks' } }]),
    );
    judgeText.mockResolvedValue({
      verdict: 'reject',
      reason: 'You’re near Starbucks, not a climbing gym.',
      placeId: 'made_up',
    });

    await t.action(internal.locationProofs.analyze, {
      verificationId: id,
      coords: HERE,
      title: 'Climb',
    });

    const row = await verification(t, id);
    expect(row).toMatchObject({ status: 'rejected' });
    expect(row?.placeId).toBeUndefined();
    expect(await completion(t, habitId)).toBeNull();
  });

  test('nowhere labeled nearby is a rejection without a model call', async () => {
    const t = setup();
    const { id } = await submitted(t);
    fetchMock.mockImplementation(async () => placesResponse([]));

    await t.action(internal.locationProofs.analyze, {
      verificationId: id,
      coords: HERE,
      title: 'Climb',
    });

    expect(judgeText).not.toHaveBeenCalled();
    expect(await verification(t, id)).toMatchObject({ status: 'rejected' });
  });

  test('a Places outage fails the check, which excuses the day', async () => {
    const t = setup();
    const { id } = await submitted(t);
    fetchMock.mockImplementation(async () => new Response('quota', { status: 429 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await t.action(internal.locationProofs.analyze, {
      verificationId: id,
      coords: HERE,
      title: 'Climb',
    });

    expect(await verification(t, id)).toMatchObject({ status: 'failed' });
  });
});

describe('places helpers', () => {
  test('the search circle grows with a rough fix, within bounds', () => {
    expect(searchRadius(5)).toBe(100);
    expect(searchRadius(60)).toBe(135);
    expect(searchRadius(400)).toBe(250);
  });

  test('distance is in metres', () => {
    const d = distanceMeters(HERE, { latitude: HERE.latitude + 0.001, longitude: HERE.longitude });
    expect(Math.round(d)).toBe(111);
  });
});
