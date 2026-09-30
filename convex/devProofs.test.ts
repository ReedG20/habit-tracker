import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { setup, signIn, TODAY, type Harness } from './test.helpers';

const inADay = () => Date.now() + 24 * 60 * 60 * 1000;

async function loggedHabit(t: Harness, userId: Id<'users'>) {
  return await t.run(async (ctx) => {
    const habitId = await ctx.db.insert('habits', { userId, title: 'Read', order: 0 });
    const photoId = await ctx.storage.store(new Blob(['proof'], { type: 'image/jpeg' }));
    await ctx.db.insert('habitVerifications', {
      userId,
      habitId,
      day: TODAY,
      photoId,
      status: 'approved',
      createdAt: 0,
      resolvedAt: 0,
    });
    await ctx.db.insert('habitCompletions', { userId, habitId, day: TODAY, completedAt: 0 });
    // Another day's log is left alone.
    await ctx.db.insert('habitCompletions', { userId, habitId, day: '2026-09-20', completedAt: 0 });
    return { habitId, photoId };
  });
}

async function provenGoal(t: Harness, userId: Id<'users'>, dueAt: number) {
  return await t.run(async (ctx) => {
    const goalId = await ctx.db.insert('goals', {
      userId,
      title: 'Ship',
      dueAt,
      order: 0,
      completedAt: Date.now(),
    });
    const stakeId = await ctx.db.insert('stakes', {
      kind: 'money',
      userId,
      goalId,
      title: 'Ship',
      createdAt: 0,
      status: 'released',
      releasedAt: Date.now(),
      amountCents: 500,
      stripeCustomerId: 'cus_1',
      stripePaymentMethodId: 'pm_1',
    });
    await ctx.db.patch('goals', goalId, { stakeId });
    const photoId = await ctx.storage.store(new Blob(['proof'], { type: 'image/jpeg' }));
    await ctx.db.insert('goalSubmissions', {
      userId,
      goalId,
      photoIds: [photoId],
      status: 'approved',
      createdAt: 0,
      resolvedAt: 0,
    });
    await ctx.db.insert('accomplishments', {
      userId,
      kind: 'goal',
      title: 'Ship',
      goalId,
      stakeId,
      dueAt,
      achievedAt: Date.now(),
    });
    return { goalId, stakeId, photoId };
  });
}

describe('dev proof resets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('ANTE_DEV_OVERRIDES', '1');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  test('are refused where dev overrides are off', async () => {
    vi.stubEnv('ANTE_DEV_OVERRIDES', '');
    const t = setup();
    const alice = await signIn(t, 'alice');
    const { habitId } = await loggedHabit(t, alice.userId);
    const { goalId } = await provenGoal(t, alice.userId, inADay());

    await expect(
      alice.as.mutation(api.devProofs.resetHabitDay, { habitId, day: TODAY }),
    ).rejects.toThrow('Developer overrides are off');
    await expect(alice.as.mutation(api.devProofs.resetGoalProof, { goalId })).rejects.toThrow(
      'Developer overrides are off',
    );
  });

  test('refuse someone else’s habit or goal', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const { habitId } = await loggedHabit(t, alice.userId);
    const { goalId } = await provenGoal(t, alice.userId, inADay());

    await expect(
      bob.as.mutation(api.devProofs.resetHabitDay, { habitId, day: TODAY }),
    ).rejects.toThrow('Unauthorized');
    await expect(bob.as.mutation(api.devProofs.resetGoalProof, { goalId })).rejects.toThrow(
      'Unauthorized',
    );
  });

  test('resetHabitDay forgets that day’s log, checks and photo only', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const { habitId, photoId } = await loggedHabit(t, alice.userId);

    await alice.as.mutation(api.devProofs.resetHabitDay, { habitId, day: TODAY });

    await t.run(async (ctx) => {
      const days = (await ctx.db.query('habitCompletions').collect()).map((row) => row.day);
      expect(days).toEqual(['2026-09-20']);
      expect(await ctx.db.query('habitVerifications').collect()).toEqual([]);
      expect(await ctx.db.system.get('_storage', photoId)).toBeNull();
    });
  });

  test('resetGoalProof reopens the goal and re-arms its stake for the deadline', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const dueAt = inADay();
    const { goalId, stakeId, photoId } = await provenGoal(t, alice.userId, dueAt);

    await alice.as.mutation(api.devProofs.resetGoalProof, { goalId });

    await t.run(async (ctx) => {
      expect((await ctx.db.get('goals', goalId))?.completedAt).toBeUndefined();
      expect(await ctx.db.query('goalSubmissions').collect()).toEqual([]);
      expect(await ctx.db.query('accomplishments').collect()).toEqual([]);
      expect(await ctx.db.system.get('_storage', photoId)).toBeNull();

      const stake = await ctx.db.get('stakes', stakeId);
      expect(stake?.status).toBe('armed');
      expect(stake?.releasedAt).toBeUndefined();
      const job = await ctx.db.system.get('_scheduled_functions', stake!.resolveJobId!);
      expect(job).toMatchObject({ name: 'stakes:resolveGoal', scheduledTime: dueAt });
    });
  });

  test('resetGoalProof refuses once the deadline has passed', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const { goalId } = await provenGoal(t, alice.userId, Date.now() - 1000);

    await expect(alice.as.mutation(api.devProofs.resetGoalProof, { goalId })).rejects.toThrow(
      'deadline has passed',
    );
  });
});
