import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { setup, signIn, TODAY, type Harness } from './test.helpers';

// Everyone here lives in UTC. Accounts and habits are made on 31 August, so the
// daily habits are first due on 1 September.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-08-31T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

async function log(t: Harness, userId: Id<'users'>, habitId: Id<'habits'>, days: string[]) {
  await t.run(async (ctx) => {
    for (const day of days) {
      await ctx.db.insert('habitCompletions', { userId, habitId, day, completedAt: 0 });
    }
  });
}

describe('calendar.month', () => {
  test('is empty when signed out', async () => {
    const t = setup();
    expect(await t.query(api.calendar.month, { month: '2026-09', today: TODAY })).toEqual({
      firstDay: TODAY,
      days: [],
    });
  });

  test('marks each day by how much of it was done', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const run = await alice.as.mutation(api.habits.create, { title: 'Run' });
    const read = await alice.as.mutation(api.habits.create, { title: 'Read' });
    const gym = await alice.as.mutation(api.habits.create, { title: 'Gym', timesPerWeek: 2 });

    await log(t, alice.userId, run, ['2026-09-01', '2026-09-02']);
    await log(t, alice.userId, read, ['2026-09-01']);
    await log(t, alice.userId, gym, ['2026-09-04']);
    await t.run(async (ctx) => {
      await ctx.db.insert('freezes', {
        userId: alice.userId,
        startDay: '2026-09-05',
        endDay: '2026-09-06',
        endsAt: Date.parse('2026-09-07T00:00:00Z'),
        days: 1,
        status: 'lifted',
        createdAt: 0,
      });
    });

    const { firstDay, days } = await alice.as.query(api.calendar.month, {
      month: '2026-09',
      today: TODAY,
    });
    const state = (day: string) => days.find((entry) => entry.day === day)?.state;

    expect(firstDay).toBe('2026-08-31');
    // Nothing after today.
    expect(days.map((entry) => entry.day)).toHaveLength(21);
    expect(state('2026-09-01')).toBe('full');
    expect(state('2026-09-02')).toBe('partial');
    expect(state('2026-09-03')).toBe('missed');
    // A weekly log counts, but the daily habits were still due.
    expect(state('2026-09-04')).toBe('partial');
    expect(state('2026-09-05')).toBe('frozen');
    expect(state('2026-09-06')).toBe('frozen');
    // Today is still open.
    expect(state(TODAY)).toBe('none');
  });

  test('a habit is not due on the day it was made', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });

    const { days } = await alice.as.query(api.calendar.month, {
      month: '2026-08',
      today: TODAY,
    });
    expect(days.find((entry) => entry.day === '2026-08-31')?.state).toBe('none');
    expect(days).toHaveLength(31);
  });

  test('history starts at the first log when that predates the account', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const run = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await log(t, alice.userId, run, ['2026-07-04']);

    const { firstDay } = await alice.as.query(api.calendar.month, {
      month: '2026-09',
      today: TODAY,
    });
    expect(firstDay).toBe('2026-07-04');
  });

  test('with only weekly habits, a log fills the day and a quiet day is not a miss', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const gym = await alice.as.mutation(api.habits.create, { title: 'Gym', timesPerWeek: 3 });
    await log(t, alice.userId, gym, ['2026-09-08']);

    const { days } = await alice.as.query(api.calendar.month, {
      month: '2026-09',
      today: TODAY,
    });
    expect(days.find((entry) => entry.day === '2026-09-08')?.state).toBe('full');
    expect(days.find((entry) => entry.day === '2026-09-09')?.state).toBe('none');
  });

  test('only counts the caller’s own logs', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const run = await bob.as.mutation(api.habits.create, { title: 'Run' });
    await log(t, bob.userId, run, ['2026-09-01']);

    const { days } = await alice.as.query(api.calendar.month, {
      month: '2026-09',
      today: TODAY,
    });
    expect(days.every((entry) => entry.state === 'none')).toBe(true);
  });
});
