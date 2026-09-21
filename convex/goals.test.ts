import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { setup, signIn } from './test.helpers';

const inAnHour = () => Date.now() + 60 * 60 * 1000;

describe('goals', () => {
  test('list is empty when signed out', async () => {
    const t = setup();
    expect(await t.query(api.goals.list, {})).toEqual([]);
  });

  test('a deadline must be at least a minute out', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await expect(
      alice.as.mutation(api.goals.create, { title: 'Ship', dueAt: Date.now() }),
    ).rejects.toThrow();
  });

  test('another user cannot read, update or delete a goal', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');

    const goalId = await alice.as.mutation(api.goals.create, { title: 'Ship', dueAt: inAnHour() });

    expect(await bob.as.query(api.goals.get, { goalId })).toBeNull();
    expect(await bob.as.query(api.goals.list, {})).toEqual([]);
    await expect(bob.as.mutation(api.goals.update, { goalId, title: 'Mine' })).rejects.toThrow(
      'Unauthorized',
    );
    await expect(bob.as.mutation(api.goals.remove, { goalId })).rejects.toThrow('Unauthorized');

    expect(await alice.as.query(api.goals.get, { goalId })).toMatchObject({ title: 'Ship' });
  });

  test('remove deletes the goal and its submissions', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, { title: 'Ship', dueAt: inAnHour() });

    await t.run(async (ctx) => {
      await ctx.db.insert('goalSubmissions', {
        userId: alice.userId,
        goalId,
        photoIds: [],
        status: 'rejected',
        createdAt: Date.now(),
      });
    });

    await alice.as.mutation(api.goals.remove, { goalId });

    expect(await alice.as.query(api.goals.get, { goalId })).toBeNull();
    const leftover = await t.run(async (ctx) => {
      return await ctx.db
        .query('goalSubmissions')
        .withIndex('by_goal', (q) => q.eq('goalId', goalId))
        .collect();
    });
    expect(leftover).toEqual([]);
  });
});
