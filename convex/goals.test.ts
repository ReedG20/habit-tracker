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

  test('stakeTotals sums armed stakes as on the line and released ones as kept', async () => {
    const t = setup();
    expect(await t.query(api.goals.stakeTotals, {})).toEqual({ onTheLineCents: 0, keptCents: 0 });

    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');

    const stake = (amountCents: number, status: 'armed' | 'released' | 'charged') => ({
      amountCents,
      stripeCustomerId: 'cus_1',
      stripePaymentMethodId: 'pm_1',
      stripeSetupIntentId: `seti_${amountCents}_${status}`,
      status,
    });

    await t.run(async (ctx) => {
      const goal = (userId: typeof alice.userId, s?: ReturnType<typeof stake>) =>
        ctx.db.insert('goals', { userId, title: 'Ship', dueAt: inAnHour(), order: 0, stake: s });

      await goal(alice.userId, stake(500, 'armed'));
      await goal(alice.userId, stake(1000, 'armed'));
      await goal(alice.userId, stake(250, 'released'));
      await goal(alice.userId, stake(2000, 'charged'));
      await goal(alice.userId);
      await goal(bob.userId, stake(5000, 'armed'));
    });

    expect(await alice.as.query(api.goals.stakeTotals, {})).toEqual({
      onTheLineCents: 1500,
      keptCents: 250,
    });
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
