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
      { _id: habitId, title: 'Run', completedToday: false, streak: 0, verification: null },
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
});
