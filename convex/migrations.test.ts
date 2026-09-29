import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { grantPro, setup, type Harness } from './test.helpers';

const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

async function signIn(t: Harness, tokenIdentifier: string) {
  const as = t.withIdentity({ tokenIdentifier, name: tokenIdentifier });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  return { as, userId };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('migrations', () => {
  test('goal money moves to its own row once, whichever way it gets there', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await t.run(async (ctx) => {
      for (const status of ['armed', 'charged'] as const) {
        await ctx.db.insert('goals', {
          userId: alice.userId,
          title: status,
          dueAt: Date.now() + 1000,
          order: 0,
          stake: {
            amountCents: 700,
            stripeCustomerId: 'cus',
            stripePaymentMethodId: 'pm',
            stripeSetupIntentId: `seti_${status}`,
            status,
          },
        });
      }
    });

    await t.mutation(internal.migrations.goalStakesToTable, {});
    await t.mutation(internal.migrations.goalStakesToTable, {});

    const stakes = await t.run(async (ctx) => await ctx.db.query('stakes').collect());
    expect(stakes.map((stake) => [stake.title, stake.status])).toEqual([
      ['armed', 'armed'],
      ['charged', 'charged'],
    ]);
    // An old loss is never sprung on anyone as new.
    expect(await alice.as.query(api.stakes.unseenLoss, {})).toBeNull();
    expect(await t.query(internal.migrations.status, {})).toMatchObject({ goalStakesLeft: 0 });
    expect(await alice.as.query(api.stakes.totals, {})).toEqual({
      onTheLineCents: 700,
      keptCents: 0,
      lostCents: 700,
    });
  });

  test('habits from before the cutover get a lockout, and it only happens once', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const oldId = await t.run(async (ctx) =>
      ctx.db.insert('habits', { userId: alice.userId, title: 'Run', order: 0 }),
    );
    const cutover = Date.now() + 1;
    vi.setSystemTime(cutover + 1000);
    const newId = await t.run(async (ctx) =>
      ctx.db.insert('habits', { userId: alice.userId, title: 'Read', order: 1 }),
    );

    await t.mutation(internal.migrations.habitsToLockoutStakes, { before: cutover });
    await t.mutation(internal.migrations.habitsToLockoutStakes, { before: cutover });

    const habits = await t.run(async (ctx) => ({
      old: await ctx.db.get('habits', oldId),
      fresh: await ctx.db.get('habits', newId),
      stakes: await ctx.db.query('stakes').collect(),
    }));
    expect(habits.stakes).toMatchObject([{ kind: 'lockout', days: 3, habitId: oldId }]);
    expect(habits.fresh?.stakeId).toBeUndefined();
  });

  test('a fresh fee lock becomes a freeze; an old one lets them back in today', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    await t.run(async (ctx) => {
      await ctx.db.insert('lockouts', {
        userId: alice.userId,
        status: 'active',
        lockedAt: at('2026-09-21', 1).getTime(),
        misses: [],
      });
      await ctx.db.insert('lockouts', {
        userId: bob.userId,
        status: 'active',
        lockedAt: at('2026-09-14', 1).getTime(),
        misses: [],
      });
    });

    vi.stubEnv('STAKES_V2', 'on');
    await t.mutation(internal.migrations.feeLockoutsToFreezes, {});

    expect(await alice.as.query(api.freezes.current, {})).toMatchObject({
      startDay: '2026-09-21',
      endDay: '2026-09-23',
    });
    expect(await bob.as.query(api.freezes.current, {})).toBeNull();
    const bobRow = await t.run(async (ctx) => await ctx.db.get('users', bob.userId));
    expect(bobRow).toMatchObject({ accountableFrom: '2026-09-22', lastCheckedDay: '2026-09-21' });
    expect(await t.query(internal.migrations.status, {})).toMatchObject({ activeFeeLockouts: 0 });
  });
});
