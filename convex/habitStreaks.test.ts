import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { finishedStreak } from './habitStreaks';
import { daysBefore } from './lib/days';
import { setup, signIn, TODAY } from './test.helpers';

type T = ReturnType<typeof setup>;

/** A habit logged on each of `backs` (days before today). With no start day, no log is cut off. */
async function habitLogged(
  t: T,
  userId: Id<'users'>,
  backs: number[],
  fields: { timesPerWeek?: number; startDay?: string } = {},
): Promise<Id<'habits'>> {
  return await t.run(async (ctx) => {
    const habitId = await ctx.db.insert('habits', { userId, title: 'Run', order: 0, ...fields });
    for (const back of backs) {
      await ctx.db.insert('habitCompletions', {
        userId,
        habitId,
        day: daysBefore(TODAY, back),
        completedAt: 0,
      });
    }
    return habitId;
  });
}

/** 0 through `count - 1`: days back from today. */
function range(count: number, skip: number[] = []): number[] {
  return Array.from({ length: count }, (_, back) => back).filter((back) => !skip.includes(back));
}

async function failCheck(t: T, userId: Id<'users'>, habitId: Id<'habits'>, back: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert('habitVerifications', {
      userId,
      habitId,
      day: daysBefore(TODAY, back),
      status: 'failed',
      createdAt: 0,
    });
  });
}

async function freeze(t: T, userId: Id<'users'>, fromBack: number, toBack: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert('freezes', {
      userId,
      startDay: daysBefore(TODAY, fromBack),
      endDay: daysBefore(TODAY, toBack),
      endsAt: 0,
      days: 3,
      status: 'lifted',
      createdAt: 0,
    });
  });
}

async function streaks(alice: Awaited<ReturnType<typeof signIn>>, habitId: Id<'habits'>) {
  const [listed] = await alice.as.query(api.habits.list, { today: TODAY });
  const stats = await alice.as.query(api.habits.stats, { habitId, today: TODAY });
  return [listed.streak, stats?.streak];
}

describe('streaks past the first window', () => {
  test('a daily streak counts every day, not just the last two months', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await habitLogged(t, alice.userId, range(200));

    expect(await streaks(alice, habitId)).toEqual([200, 200]);
  });

  test('a weekly streak counts every week that hit the target', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    // Every day for the 30 weeks before this one (TODAY is a Monday), and today.
    const habitId = await habitLogged(t, alice.userId, range(30 * 7 + 1), { timesPerWeek: 3 });

    expect(await streaks(alice, habitId)).toEqual([30, 30]);
  });

  test('an old freeze bridges the run', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await habitLogged(t, alice.userId, range(100, [80, 81, 82]));
    await freeze(t, alice.userId, 82, 80);

    expect(await streaks(alice, habitId)).toEqual([97, 97]);
  });

  test('a restarted habit still counts only from its new start', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await habitLogged(t, alice.userId, range(150), {
      startDay: daysBefore(TODAY, 100),
    });

    expect(await streaks(alice, habitId)).toEqual([101, 101]);
  });
});

describe('excused days', () => {
  test('a failed check bridges a daily streak, in the window and before it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await habitLogged(t, alice.userId, range(100, [1, 70]));
    await failCheck(t, alice.userId, habitId, 1);
    await failCheck(t, alice.userId, habitId, 70);

    expect(await streaks(alice, habitId)).toEqual([98, 98]);
  });

  test('a failed check counts toward a weekly target', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    // Weeks of Sep 7 and Sep 14: one log and one failed check each.
    const habitId = await habitLogged(t, alice.userId, [14, 7], { timesPerWeek: 2 });
    await failCheck(t, alice.userId, habitId, 13);
    await failCheck(t, alice.userId, habitId, 6);

    expect(await streaks(alice, habitId)).toEqual([2, 2]);
  });

  test('the Kept and loss screens count a run through excused days and old freezes', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    // Armed 40 days ago; ended yesterday. Day 20 was excused, days 30 and 31 frozen.
    const backs = range(41, [0, 20, 30, 31]);
    const habitId = await habitLogged(t, alice.userId, backs);
    await failCheck(t, alice.userId, habitId, 20);
    await freeze(t, alice.userId, 31, 30);

    const streak = await t.run(async (ctx) => {
      const habit = await ctx.db.get('habits', habitId);
      return await finishedStreak(
        ctx,
        habit!,
        daysBefore(TODAY, 40),
        daysBefore(TODAY, 1),
        new Set(backs.map((back) => daysBefore(TODAY, back))),
      );
    });
    expect(streak).toBe(37);
  });
});
