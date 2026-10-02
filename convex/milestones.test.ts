import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { nextDay } from './lib/days';
import { setup, signIn, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Everyone here lives in UTC.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

async function user(t: Harness, name: string) {
  const { as, userId } = await signIn(t, name);
  await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  return { as, userId };
}

async function logDays(t: Harness, userId: Id<'users'>, habitId: Id<'habits'>, days: string[]) {
  await t.run(async (ctx) => {
    for (const day of days) {
      await ctx.db.insert('habitCompletions', { userId, habitId, day, completedAt: Date.now() });
    }
  });
}

function range(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = nextDay(day)) days.push(day);
  return days;
}

/** A photo approved for `day`, the way the model's verdict lands. */
async function approve(t: Harness, userId: Id<'users'>, habitId: Id<'habits'>, day: string) {
  const verificationId = await t.run(async (ctx) => {
    const photoId = await ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' }));
    return await ctx.db.insert('habitVerifications', {
      userId,
      habitId,
      day,
      photoId,
      status: 'pending',
      createdAt: Date.now(),
    });
  });
  await t.mutation(internal.verifications.resolve, {
    verificationId,
    status: 'approved',
    reason: 'Looks right',
  });
}

const milestonesOf = (t: Harness, habitId: Id<'habits'>) =>
  t.run(async (ctx) =>
    (
      await ctx.db
        .query('milestones')
        .withIndex('by_habit_and_count', (q) => q.eq('habitId', habitId))
        .collect()
    ).map(({ count, unit, runStart }) => ({ count, unit, runStart })),
  );

describe('streak milestones', () => {
  test('the seventh day in a row is marked once, and shown once', async () => {
    const t = setup();
    const alice = await user(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await logDays(t, alice.userId, habitId, range('2026-09-21', '2026-09-26'));
    expect(await milestonesOf(t, habitId)).toEqual([]);

    await approve(t, alice.userId, habitId, '2026-09-27');
    await approve(t, alice.userId, habitId, '2026-09-27');
    expect(await milestonesOf(t, habitId)).toEqual([
      { count: 7, unit: 'day', runStart: '2026-09-21' },
    ]);

    const unseen = await alice.as.query(api.milestones.unseen, {});
    expect(unseen).toMatchObject({ title: 'Run', count: 7, unit: 'day', next: 14, seen: false });
    await alice.as.mutation(api.milestones.markSeen, { milestoneId: unseen!._id });
    expect(await alice.as.query(api.milestones.unseen, {})).toBeNull();
  });

  test('a restarted run can reach the same one again', async () => {
    const t = setup();
    const alice = await user(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await logDays(t, alice.userId, habitId, range('2026-09-21', '2026-09-26'));
    await approve(t, alice.userId, habitId, '2026-09-27');

    await t.run(async (ctx) => ctx.db.patch('habits', habitId, { startDay: '2026-10-01' }));
    await logDays(t, alice.userId, habitId, range('2026-10-01', '2026-10-06'));
    await approve(t, alice.userId, habitId, '2026-10-07');
    expect(await milestonesOf(t, habitId)).toEqual([
      { count: 7, unit: 'day', runStart: '2026-09-21' },
      { count: 7, unit: 'day', runStart: '2026-10-01' },
    ]);
  });

  test('a weekly habit counts in weeks met', async () => {
    const t = setup();
    const alice = await user(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Gym',
      timesPerWeek: 3,
    });
    // Its weeks start Mondays, the day it was made. Three weeks met, then two logs.
    await logDays(t, alice.userId, habitId, [
      '2026-09-21',
      '2026-09-23',
      '2026-09-25',
      '2026-09-28',
      '2026-09-30',
      '2026-10-02',
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
      '2026-10-14',
    ]);
    expect(await milestonesOf(t, habitId)).toEqual([]);

    await approve(t, alice.userId, habitId, '2026-10-16');
    expect(await milestonesOf(t, habitId)).toEqual([
      { count: 4, unit: 'week', runStart: '2026-09-21' },
    ]);
  });

  test('stay with their own user, and go with the habit', async () => {
    const t = setup();
    const alice = await user(t, 'alice');
    const bob = await user(t, 'bob');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await logDays(t, alice.userId, habitId, range('2026-09-21', '2026-09-26'));
    await approve(t, alice.userId, habitId, '2026-09-27');
    const mine = await alice.as.query(api.milestones.unseen, {});

    expect(await bob.as.query(api.milestones.unseen, {})).toBeNull();
    expect(await bob.as.query(api.milestones.get, { milestoneId: mine!._id })).toBeNull();
    await expect(
      bob.as.mutation(api.milestones.markSeen, { milestoneId: mine!._id }),
    ).rejects.toThrow(/not found/);

    await alice.as.mutation(api.habits.remove, { habitId });
    expect(await milestonesOf(t, habitId)).toEqual([]);
  });
});
