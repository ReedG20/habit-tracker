import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { judgePhotos } from './lib/vision';
import { grantPro, setup as baseSetup, type Harness } from './test.helpers';

// convex-test keeps no content type on stored files, so without this no
// submission gets past the image check.
vi.mock('./lib/vision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/vision')>()),
  IMAGE_CONTENT_TYPES: new Set(['', 'image/jpeg']),
  judgePhotos: vi.fn(),
}));

const DAY = '2026-09-21';
const NOW = new Date(`${DAY}T12:00:00Z`).getTime();
const HOUR_MS = 60 * 60 * 1000;

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  return t;
}

async function signIn(t: Harness) {
  const as = t.withIdentity({ tokenIdentifier: 'alice', name: 'alice' });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  return as;
}

async function imageId(t: Harness): Promise<Id<'_storage'>> {
  return await t.run(
    async (ctx) => await ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' })),
  );
}

/** The args the latest scheduled call to `name` was given. */
async function scheduledArgs(t: Harness, name: string): Promise<Record<string, unknown>> {
  const jobs = await t.run(
    async (ctx) => await ctx.db.system.query('_scheduled_functions').collect(),
  );
  const job = jobs.filter((row) => row.name.endsWith(name)).at(-1);
  if (job === undefined) throw new Error(`Nothing scheduled for ${name}`);
  return job.args[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(judgePhotos).mockReset();
  vi.mocked(judgePhotos).mockResolvedValue({ verdict: 'approve', reason: 'Nice.' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('habit photo origin', () => {
  test('is stored and handed to the check', async () => {
    const t = setup();
    const as = await signIn(t);
    const habitId = await as.mutation(api.habits.create, { title: 'Gym' });

    const photoOrigin = {
      source: 'library' as const,
      takenAt: NOW - 2 * HOUR_MS,
      device: '  Apple iPhone 15 Pro  ',
    };
    const verificationId = await as.mutation(api.verifications.submit, {
      habitId,
      day: DAY,
      photoId: await imageId(t),
      photoOrigin,
    });

    const cleaned = {
      source: 'library',
      takenAt: NOW - 2 * HOUR_MS,
      device: 'Apple iPhone 15 Pro',
    };
    const row = await t.run(async (ctx) => await ctx.db.get('habitVerifications', verificationId));
    expect(row?.photoOrigin).toEqual(cleaned);
    expect((await scheduledArgs(t, 'verifications:analyze')).photoOrigin).toEqual(cleaned);
  });

  test('reaches the model as a line about the photo', async () => {
    const t = setup();
    const as = await signIn(t);
    const habitId = await as.mutation(api.habits.create, { title: 'Gym' });
    const verificationId = await as.mutation(api.verifications.submit, {
      habitId,
      day: DAY,
      photoId: await imageId(t),
    });
    const photoId = (await t.run(
      async (ctx) => await ctx.db.get('habitVerifications', verificationId),
    ))!.photoId!;

    await t.action(internal.verifications.analyze, {
      verificationId,
      photoId,
      title: 'Gym',
      photoOrigin: { source: 'library' },
    });

    expect(vi.mocked(judgePhotos).mock.calls[0][0].text).toContain(
      'Photo 1: picked from the photo library with no camera metadata',
    );
  });

  test('is optional, for builds from before it existed', async () => {
    const t = setup();
    const as = await signIn(t);
    const habitId = await as.mutation(api.habits.create, { title: 'Gym' });
    const verificationId = await as.mutation(api.verifications.submit, {
      habitId,
      day: DAY,
      photoId: await imageId(t),
    });

    const row = await t.run(async (ctx) => await ctx.db.get('habitVerifications', verificationId));
    expect(row?.photoOrigin).toBeUndefined();
  });
});

describe('goal photo origins', () => {
  async function makeGoal(t: Harness) {
    const as = await signIn(t);
    const goalId = await as.mutation(api.goals.create, {
      title: 'Ship',
      dueAt: NOW + 7 * 24 * HOUR_MS,
    });
    return { as, goalId };
  }

  test('are stored in photo order and handed to the check', async () => {
    const t = setup();
    const { as, goalId } = await makeGoal(t);
    vi.setSystemTime(NOW + 3 * HOUR_MS);

    const photoOrigins = [
      { source: 'camera' as const },
      { source: 'library' as const, takenAt: NOW + HOUR_MS, device: 'Apple iPhone 15 Pro' },
    ];
    const submissionId = await as.mutation(api.goalSubmissions.create, {
      goalId,
      photoIds: [await imageId(t), await imageId(t)],
      photoOrigins,
    });

    const row = await t.run(async (ctx) => await ctx.db.get('goalSubmissions', submissionId));
    expect(row?.photoOrigins).toEqual(photoOrigins);
    expect((await scheduledArgs(t, 'goalSubmissions:analyze')).photoOrigins).toEqual(photoOrigins);
  });

  test('refuse a photo taken before the goal was made', async () => {
    const t = setup();
    const { as, goalId } = await makeGoal(t);

    await expect(
      as.mutation(api.goalSubmissions.create, {
        goalId,
        photoIds: [await imageId(t)],
        photoOrigins: [{ source: 'library', takenAt: NOW - HOUR_MS }],
      }),
    ).rejects.toThrow('Proof photos have to be taken after you made the goal');
  });

  test('allow a few minutes of clock skew', async () => {
    const t = setup();
    const { as, goalId } = await makeGoal(t);

    await as.mutation(api.goalSubmissions.create, {
      goalId,
      photoIds: [await imageId(t)],
      photoOrigins: [{ source: 'library', takenAt: NOW - 60 * 1000 }],
    });
  });

  test('must match the photos one to one', async () => {
    const t = setup();
    const { as, goalId } = await makeGoal(t);

    await expect(
      as.mutation(api.goalSubmissions.create, {
        goalId,
        photoIds: [await imageId(t), await imageId(t)],
        photoOrigins: [{ source: 'camera' }],
      }),
    ).rejects.toThrow('Every photo needs its origin');
  });

  test('stay beside their photos when one has gone missing', async () => {
    const t = setup();
    const { as, goalId } = await makeGoal(t);
    const missing = await imageId(t);
    const kept = await imageId(t);
    const submissionId = await as.mutation(api.goalSubmissions.create, {
      goalId,
      photoIds: [missing, kept],
      photoOrigins: [{ source: 'camera' }, { source: 'library' }],
    });
    await t.run(async (ctx) => await ctx.storage.delete(missing));

    await t.action(internal.goalSubmissions.analyze, {
      submissionId,
      photoIds: [missing, kept],
      photoOrigins: [{ source: 'camera' }, { source: 'library' }],
      title: 'Ship',
    });

    const { text, imageUrls } = vi.mocked(judgePhotos).mock.calls[0][0];
    expect(imageUrls).toHaveLength(1);
    expect(text).toContain('Photo 1: picked from the photo library with no camera metadata');
    expect(text).not.toContain('in-app camera');
  });
});
