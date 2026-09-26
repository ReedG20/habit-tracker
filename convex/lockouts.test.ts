import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { setup, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Every user here lives in UTC, so local midnight is 00:00Z.
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

async function signIn(t: Harness, tokenIdentifier: string) {
  const as = t.withIdentity({ tokenIdentifier, name: tokenIdentifier });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  return { as, userId };
}

async function runCheck(t: Harness, day: string, hour = 1) {
  vi.setSystemTime(at(day, hour));
  await t.mutation(internal.lockouts.checkAll, {});
}

async function logDay(t: Harness, userId: Id<'users'>, habitId: Id<'habits'>, day: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert('habitCompletions', { userId, habitId, day, completedAt: Date.now() });
  });
}

/** Reports a re-entry purchase; returns whether the user is still locked. */
async function pay(
  t: Harness,
  userId: Id<'users'>,
  transactionId: string,
  purchasedAt = Date.now(),
) {
  return await t.mutation(internal.lockouts.recordReentryPayments, {
    userId,
    payments: [{ transactionId, productId: 'ante_reentry', environment: 'SANDBOX', purchasedAt }],
  });
}

async function imageId(t: Harness): Promise<Id<'_storage'>> {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('lockout check', () => {
  test('nobody is checked until their time zone is known', async () => {
    const t = setup();
    const as = t.withIdentity({ tokenIdentifier: 'old', name: 'old' });
    await as.mutation(api.users.storeUser, {});
    await as.mutation(api.habits.create, { title: 'Run' });

    await runCheck(t, '2026-09-25');
    expect(await as.query(api.lockouts.current, {})).toBeNull();
  });

  test('the first day and the day a habit is made are free', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });

    await runCheck(t, '2026-09-22');
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
  });

  test('every habit missed the same day shares one lock', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.habits.create, { title: 'Read' });

    await runCheck(t, '2026-09-23');

    const lockout = await alice.as.query(api.lockouts.current, {});
    expect(lockout?.misses).toMatchObject([
      { title: 'Run', kind: 'day', period: '2026-09-22' },
      { title: 'Read', kind: 'day', period: '2026-09-22' },
    ]);
    const all = await t.run(async (ctx) => await ctx.db.query('lockouts').collect());
    expect(all).toHaveLength(1);
  });

  test('a logged day is no miss, and the check does not repeat a day', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await logDay(t, alice.userId, habitId, '2026-09-22');

    await runCheck(t, '2026-09-23');
    await runCheck(t, '2026-09-23', 2);
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
  });

  test('a photo still being judged holds the check until it resolves', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await t.run(async (ctx) => {
      await ctx.db.insert('habitVerifications', {
        userId: alice.userId,
        habitId,
        day: '2026-09-22',
        photoId: await ctx.storage.store(new Blob(['x'], { type: 'image/jpeg' })),
        status: 'pending',
        createdAt: Date.now(),
      });
    });

    await runCheck(t, '2026-09-23');
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();

    await logDay(t, alice.userId, habitId, '2026-09-22');
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query('habitVerifications').collect();
      await ctx.db.patch('habitVerifications', row._id, { status: 'approved' });
    });
    await runCheck(t, '2026-09-23', 2);
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
  });
});

describe('while locked', () => {
  async function lockedUser(t: Harness) {
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship',
      dueAt: at('2026-09-30').getTime(),
    });
    await runCheck(t, '2026-09-23');
    expect(await alice.as.query(api.lockouts.current, {})).not.toBeNull();
    return { ...alice, habitId, goalId };
  }

  test('habits and goals are frozen', async () => {
    const t = setup();
    const alice = await lockedUser(t);
    const locked = 'Ante is locked';

    await expect(alice.as.mutation(api.habits.create, { title: 'Swim' })).rejects.toThrow(locked);
    await expect(
      alice.as.mutation(api.habits.update, { habitId: alice.habitId, title: 'Jog' }),
    ).rejects.toThrow(locked);
    await expect(alice.as.mutation(api.habits.remove, { habitId: alice.habitId })).rejects.toThrow(
      locked,
    );
    await expect(
      alice.as.mutation(api.verifications.submit, {
        habitId: alice.habitId,
        day: '2026-09-23',
        photoId: await imageId(t),
      }),
    ).rejects.toThrow(locked);
    await expect(
      alice.as.mutation(api.goals.create, { title: 'More', dueAt: at('2026-09-30').getTime() }),
    ).rejects.toThrow(locked);
    await expect(alice.as.mutation(api.goals.remove, { goalId: alice.goalId })).rejects.toThrow(
      locked,
    );
  });

  test('goal proof can still be submitted', async () => {
    const t = setup();
    const alice = await lockedUser(t);

    // convex-test keeps no content type on stored files, so the image check is
    // as far as a submission can get here: past the lock is what matters.
    await expect(
      alice.as.mutation(api.goalSubmissions.create, {
        goalId: alice.goalId,
        photoIds: [await imageId(t)],
      }),
    ).rejects.toThrow('not a supported image');
  });

  test('locked days are never judged, and paying makes today free', async () => {
    const t = setup();
    const alice = await lockedUser(t);

    // Two more days go by locked, then the fee is paid on the 25th.
    await runCheck(t, '2026-09-25');
    vi.setSystemTime(at('2026-09-25', 15));
    await pay(t, alice.userId, 'tx_1');
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();

    // The 25th itself is free; the 26th is not.
    await runCheck(t, '2026-09-26');
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
    await runCheck(t, '2026-09-27');
    expect(await alice.as.query(api.lockouts.current, {})).toMatchObject({
      misses: [{ period: '2026-09-26' }],
    });
  });

  test('a payment counts once, however many times it is reported', async () => {
    const t = setup();
    const alice = await lockedUser(t);
    const purchasedAt = Date.now();

    await pay(t, alice.userId, 'tx_1', purchasedAt);
    await runCheck(t, '2026-09-26');
    expect(await alice.as.query(api.lockouts.current, {})).not.toBeNull();

    // Reported again (the webhook after `confirmReentry`): the new lock stays.
    expect(await pay(t, alice.userId, 'tx_1', purchasedAt)).toBe(true);
    // Even under another id: it was bought before this lock began.
    expect(await pay(t, alice.userId, 'rc_other_id', purchasedAt)).toBe(true);
  });

  test('the re-entry webhook unlocks', async () => {
    const t = setup();
    const alice = await lockedUser(t);

    await t.mutation(internal.revenuecat.handleEvent, {
      eventId: 'evt_1',
      event: {
        type: 'NON_RENEWING_PURCHASE',
        appUserId: alice.userId,
        aliases: [],
        eventTimestampMs: Date.now(),
        environment: 'PRODUCTION',
        entitlementIds: [],
        productId: 'ante_reentry',
        transactionId: 'tx_9',
      },
    });

    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
    const subscription = await t.run(async (ctx) => await ctx.db.query('subscriptions').first());
    expect(subscription).toBeNull();
  });

  test('a payment made with no lock active is not carried over', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    await pay(t, alice.userId, 'tx_1');

    await runCheck(t, '2026-09-23');
    expect(await alice.as.query(api.lockouts.current, {})).not.toBeNull();
  });
});

describe('deleting', () => {
  test('a habit still owed today is only scheduled, and still counts', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });

    vi.setSystemTime(at('2026-09-22', 20));
    expect(await alice.as.mutation(api.habits.remove, { habitId })).toBe('scheduled');
    expect(await alice.as.query(api.habits.get, { habitId })).toMatchObject({
      endsAfter: '2026-09-22',
    });

    // Skipped anyway: the lock still comes, and the habit is gone after it.
    await runCheck(t, '2026-09-23');
    expect(await alice.as.query(api.lockouts.current, {})).not.toBeNull();
    expect(await alice.as.query(api.habits.get, { habitId })).toBeNull();
  });

  test('a scheduled habit that gets done its last day ends without a lock', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });

    vi.setSystemTime(at('2026-09-22', 8));
    await alice.as.mutation(api.habits.remove, { habitId });
    await logDay(t, alice.userId, habitId, '2026-09-22');

    await runCheck(t, '2026-09-23');
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
    expect(await alice.as.query(api.habits.get, { habitId })).toBeNull();
  });

  test('a habit with nothing owed is deleted right away', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    // Made today, so today is free and nothing is owed yet.
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    expect(await alice.as.mutation(api.habits.remove, { habitId })).toBe('deleted');
    expect(await alice.as.query(api.habits.get, { habitId })).toBeNull();
  });

  test('a goal with money on it cannot be deleted; force needs dev overrides', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await t.run(async (ctx) => {
      return await ctx.db.insert('goals', {
        userId: alice.userId,
        title: 'Ship',
        dueAt: at('2026-09-30').getTime(),
        order: 0,
        stake: {
          amountCents: 500,
          stripeCustomerId: 'cus_1',
          stripePaymentMethodId: 'pm_1',
          stripeSetupIntentId: 'seti_1',
          status: 'armed',
        },
      });
    });

    await expect(alice.as.mutation(api.goals.remove, { goalId })).rejects.toThrow(
      'runs to its deadline',
    );
    await expect(alice.as.mutation(api.goals.remove, { goalId, force: true })).rejects.toThrow(
      'Developer overrides are off',
    );

    vi.stubEnv('ANTE_DEV_OVERRIDES', '1');
    await alice.as.mutation(api.goals.remove, { goalId, force: true });
    expect(await alice.as.query(api.goals.get, { goalId })).toBeNull();
  });
});

describe('developer tools', () => {
  test('lock and unlock need dev overrides', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await expect(alice.as.mutation(api.lockouts.devLock, {})).rejects.toThrow(
      'Developer overrides are off',
    );

    vi.stubEnv('ANTE_DEV_OVERRIDES', '1');
    await alice.as.mutation(api.lockouts.devLock, {});
    expect(await alice.as.query(api.lockouts.current, {})).not.toBeNull();
    await alice.as.mutation(api.lockouts.devUnlock, {});
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
  });
});
