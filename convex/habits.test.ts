import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { setup, signIn, TODAY } from './test.helpers';

describe('habits', () => {
  test('list is empty, not an error, when signed out', async () => {
    const t = setup();
    expect(await t.query(api.habits.list, { today: TODAY })).toEqual([]);
    expect(await t.query(api.habits.loggedCount, {})).toBe(0);
  });

  test('create requires a signed-in user', async () => {
    const t = setup();
    await expect(t.mutation(api.habits.create, { title: 'Run' })).rejects.toThrow(
      'Not authenticated',
    );
  });

  test('list returns only the caller’s habits with progress fields', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');

    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await bob.as.mutation(api.habits.create, { title: 'Read' });

    const habits = await alice.as.query(api.habits.list, { today: TODAY });
    expect(habits).toMatchObject([
      {
        _id: habitId,
        title: 'Run',
        timesPerWeek: 7,
        completedToday: false,
        weekCount: 0,
        streak: 0,
        verification: null,
      },
    ]);
  });

  test('another user cannot read, update or delete a habit', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');

    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });

    // Reads answer null (a deleted habit's screen is a normal state)…
    expect(await bob.as.query(api.habits.get, { habitId })).toBeNull();
    expect(await bob.as.query(api.habits.stats, { habitId, today: TODAY })).toBeNull();
    // …while writes refuse outright.
    await expect(bob.as.mutation(api.habits.update, { habitId, title: 'Mine' })).rejects.toThrow(
      'Unauthorized',
    );
    await expect(bob.as.mutation(api.habits.remove, { habitId })).rejects.toThrow('Unauthorized');

    expect(await alice.as.query(api.habits.get, { habitId })).toMatchObject({ title: 'Run' });
  });

  test('create checks the name and how often it is due', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');

    await expect(alice.as.mutation(api.habits.create, { title: '   ' })).rejects.toThrow(
      'Give it a name',
    );
    for (const timesPerWeek of [0, 8, 2.5]) {
      await expect(
        alice.as.mutation(api.habits.create, { title: 'Run', timesPerWeek }),
      ).rejects.toThrow('1 to 7 days a week');
    }

    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run', timesPerWeek: 3 });
    expect(await alice.as.query(api.habits.get, { habitId })).toMatchObject({ timesPerWeek: 3 });
  });

  test('a weekly habit counts this week and streaks in weeks', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Gym', timesPerWeek: 2 });

    // Two logs in each of the last two weeks, one so far this week (TODAY is a Monday).
    const days = ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17', TODAY];
    await t.run(async (ctx) => {
      for (const day of days) {
        await ctx.db.insert('habitCompletions', {
          userId: alice.userId,
          habitId,
          day,
          completedAt: 0,
        });
      }
    });

    const [habit] = await alice.as.query(api.habits.list, { today: TODAY });
    expect(habit).toMatchObject({ completedToday: true, weekCount: 1, streak: 2 });
    expect(await alice.as.query(api.habits.stats, { habitId, today: TODAY })).toEqual({
      total: 5,
      streak: 2,
    });
  });

  test('a habit made before frequency existed is daily', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('habits', { userId: alice.userId, title: 'Read', order: 0 });
      for (const day of ['2026-09-19', '2026-09-20']) {
        await ctx.db.insert('habitCompletions', {
          userId: alice.userId,
          habitId: id,
          day,
          completedAt: 0,
        });
      }
      return id;
    });

    const [habit] = await alice.as.query(api.habits.list, { today: TODAY });
    expect(habit).toMatchObject({ _id: habitId, weekCount: 0, streak: 2 });
    expect(habit.timesPerWeek).toBeUndefined();
  });
});
