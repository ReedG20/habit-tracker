import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { grantPro, setup as baseSetup, type Harness } from './test.helpers';

// convex-test keeps no content type on stored files, so without this no
// submission gets past the image check to the limiter.
vi.mock('./lib/vision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/vision')>()),
  IMAGE_CONTENT_TYPES: new Set(['', 'image/jpeg']),
  judgePhotos: vi.fn(),
}));

const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
const DAY = '2026-09-21';
const MINUTE_MS = 60 * 1000;

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  return t;
}

async function signIn(t: Harness, tokenIdentifier: string) {
  const as = t.withIdentity({ tokenIdentifier, name: tokenIdentifier });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  return { as, userId };
}

type Client = Awaited<ReturnType<typeof signIn>>['as'];

async function imageId(t: Harness): Promise<Id<'_storage'>> {
  return await t.run(
    async (ctx) => await ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' })),
  );
}

/** Submits a habit photo and has it rejected, freeing the habit for another try. */
async function rejectedPhoto(t: Harness, as: Client, habitId: Id<'habits'>) {
  const verificationId = await as.mutation(api.verifications.submit, {
    habitId,
    day: DAY,
    photoId: await imageId(t),
  });
  await t.mutation(internal.verifications.resolve, {
    verificationId,
    status: 'rejected',
    reason: 'Not it',
  });
}

/** Submits goal proof and has it rejected, freeing the goal for another try. */
async function rejectedSubmission(t: Harness, as: Client, goalId: Id<'goals'>) {
  const submissionId = await as.mutation(api.goalSubmissions.create, {
    goalId,
    photoIds: [await imageId(t)],
  });
  await t.mutation(internal.goalSubmissions.resolve, {
    submissionId,
    status: 'rejected',
    reason: 'Not it',
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(DAY));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('habit photo proof', () => {
  test('is rate limited per user, and refills', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const aliceHabit = await alice.as.mutation(api.habits.create, { title: 'Run' });
    const bobHabit = await bob.as.mutation(api.habits.create, { title: 'Run' });

    for (let i = 0; i < 6; i += 1) {
      await rejectedPhoto(t, alice.as, aliceHabit);
    }
    await expect(rejectedPhoto(t, alice.as, aliceHabit)).rejects.toThrow('That’s a lot of photos');

    // Someone else's bucket is untouched.
    await rejectedPhoto(t, bob.as, bobHabit);

    // 12 an hour: one back every five minutes.
    vi.setSystemTime(at(DAY).getTime() + 6 * MINUTE_MS);
    await rejectedPhoto(t, alice.as, aliceHabit);
  });
});

describe('goal proof', () => {
  test('is rate limited per user', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const dueAt = at('2026-09-28').getTime();
    const aliceGoal = await alice.as.mutation(api.goals.create, { title: 'Ship', dueAt });
    const bobGoal = await bob.as.mutation(api.goals.create, { title: 'Ship', dueAt });

    for (let i = 0; i < 4; i += 1) {
      await rejectedSubmission(t, alice.as, aliceGoal);
    }
    await expect(rejectedSubmission(t, alice.as, aliceGoal)).rejects.toThrow(
      'That’s a lot of submissions',
    );

    await rejectedSubmission(t, bob.as, bobGoal);
  });
});
