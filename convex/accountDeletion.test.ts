import Stripe from 'stripe';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { CHARGING_ERROR, PURGE_BATCH } from './accountDeletion';
import { api, internal } from './_generated/api';
import type { Id, TableNames } from './_generated/dataModel';
import schema from './schema';
import { setup, signIn, TODAY, type Harness } from './test.helpers';

const stripe = vi.hoisted(() => ({ customers: { del: vi.fn() } }));
vi.mock('./lib/stripe', () => ({ stripeClient: () => stripe }));

beforeEach(() => {
  stripe.customers.del.mockReset();
});

const FUTURE = Date.UTC(2100, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

type Seeded = {
  photos: Id<'_storage'>[];
  armedStakeId: Id<'stakes'>;
  resolveJobId: Id<'_scheduled_functions'>;
};

/** One of everything a user can own, photos included. */
async function seed(t: Harness, userId: Id<'users'>, name: string): Promise<Seeded> {
  return await t.run(async (ctx) => {
    const photo = () => ctx.storage.store(new Blob([name], { type: 'image/jpeg' }));
    const habitPhoto = await photo();
    const goalPhoto = await photo();
    const keptPhoto = await photo();

    await ctx.db.patch('users', userId, { stripeCustomerId: `cus_${name}` });

    const habitId = await ctx.db.insert('habits', { userId, title: 'Run', order: 0 });
    await ctx.db.insert('habitCompletions', { userId, habitId, day: TODAY, completedAt: 0 });
    await ctx.db.insert('habitVerifications', {
      userId,
      habitId,
      day: TODAY,
      photoId: habitPhoto,
      status: 'approved',
      createdAt: 0,
    });
    await ctx.db.insert('habitTimerRuns', {
      userId,
      habitId,
      day: TODAY,
      startedAt: 0,
      durationMs: 60_000,
      status: 'completed',
    });

    const goalId = await ctx.db.insert('goals', {
      userId,
      title: 'Ship',
      dueAt: FUTURE,
      order: 0,
    });
    await ctx.db.insert('goalSubmissions', {
      userId,
      goalId,
      photoIds: [goalPhoto],
      status: 'pending',
      createdAt: 0,
    });

    const armedStakeId = await ctx.db.insert('stakes', {
      kind: 'money',
      userId,
      goalId,
      title: 'Ship',
      createdAt: 0,
      status: 'armed',
      amountCents: 1000,
      stripeCustomerId: `cus_${name}`,
      stripePaymentMethodId: 'pm_test',
    });
    // A day out: convex-test arms a real timer, and one past 2^31 ms fires at once.
    const resolveJobId = await ctx.scheduler.runAfter(DAY_MS, internal.stakes.resolveGoal, {
      stakeId: armedStakeId,
      attempt: 0,
    });
    await ctx.db.patch('stakes', armedStakeId, { resolveJobId });
    await ctx.db.patch('goals', goalId, { stakeId: armedStakeId });
    await ctx.db.insert('graces', {
      userId,
      stakeId: armedStakeId,
      kind: 'extended',
      goalId,
      title: 'Ship',
      originalDueAt: 0,
      extendedTo: FUTURE,
      grantedAt: 0,
    });

    const friendId = await ctx.db.insert('friends', {
      userId,
      name: 'Sam',
      email: `sam+${name}@example.com`,
      status: 'active',
      optOutToken: `token_${name}`,
      createdAt: 0,
    });
    await ctx.db.insert('stakes', {
      kind: 'friend',
      userId,
      habitId,
      title: 'Run',
      createdAt: 0,
      status: 'armed',
      friendId,
      friendName: 'Sam',
      friendEmail: `sam+${name}@example.com`,
    });

    // A goal charged and then deleted: its proof is held (`evidence.ts`), and the charge contested.
    const deletedGoalId = await ctx.db.insert('goals', {
      userId,
      title: 'Gone',
      dueAt: 0,
      order: 1,
    });
    await ctx.db.insert('goalSubmissions', {
      userId,
      goalId: deletedGoalId,
      photoIds: [keptPhoto],
      status: 'rejected',
      createdAt: 0,
    });
    const chargedStakeId = await ctx.db.insert('stakes', {
      kind: 'money',
      userId,
      goalId: deletedGoalId,
      title: 'Gone',
      createdAt: 0,
      lostAt: 0,
      status: 'charged',
      chargedAt: 0,
      amountCents: 500,
      stripeCustomerId: `cus_${name}`,
      stripePaymentMethodId: 'pm_test',
    });
    await ctx.db.delete('goals', deletedGoalId);
    await ctx.db.insert('chargeReviews', {
      userId,
      stakeId: chargedStakeId,
      reason: 'proof_should_count',
      status: 'open',
      createdAt: 0,
    });

    await ctx.db.insert('contracts', {
      userId,
      kind: 'habit',
      habitId,
      terms: [{ text: 'Run' }],
      signature: { width: 1, height: 1, strokes: [] },
    });
    await ctx.db.insert('accomplishments', {
      userId,
      kind: 'goal',
      title: 'Old goal',
      achievedAt: 0,
    });
    await ctx.db.insert('freezes', {
      userId,
      startDay: TODAY,
      endDay: TODAY,
      endsAt: FUTURE,
      days: 1,
      status: 'lifted',
      createdAt: 0,
    });
    await ctx.db.insert('lockouts', { userId, status: 'paid', lockedAt: 0, misses: [] });
    await ctx.db.insert('reentryPayments', {
      userId,
      transactionId: `tx_${name}`,
      productId: 'ante_reentry',
      environment: 'SANDBOX',
      receivedAt: 0,
    });
    await ctx.db.insert('pushTokens', {
      userId,
      token: `ExponentPushToken[${name}]`,
      permission: 'granted',
      updatedAt: 0,
    });
    await ctx.db.insert('notificationSettings', {
      userId,
      preset: 'firm',
      morningLineup: true,
      breakThroughFocus: false,
      approvals: true,
      updatedAt: 0,
    });
    await ctx.db.insert('reminderState', { userId, generation: 0, sentThrough: 0, sentToday: 0 });

    return { photos: [habitPhoto, goalPhoto, keptPhoto], armedStakeId, resolveJobId };
  });
}

/** How many rows in each table belong to `userId`, the `users` row included. */
async function ownedRows(t: Harness, userId: Id<'users'>): Promise<Record<string, number>> {
  return await t.run(async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of Object.keys(schema.tables) as TableNames[]) {
      const rows = (await ctx.db.query(table).collect()) as { _id: string; userId?: string }[];
      const n = rows.filter((row) => row.userId === userId || row._id === userId).length;
      if (n > 0) counts[table] = n;
    }
    return counts;
  });
}

async function photosLeft(t: Harness, photos: Id<'_storage'>[]): Promise<number> {
  return await t.run(async (ctx) => {
    const found = await Promise.all(photos.map((id) => ctx.db.system.get('_storage', id)));
    return found.filter((file) => file !== null).length;
  });
}

describe('users.deleteAccount', () => {
  test("deletes every row and photo the user owns, and nobody else's", async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const aliceData = await seed(t, alice.userId, 'alice');
    const bobData = await seed(t, bob.userId, 'bob');
    const bobBefore = await ownedRows(t, bob.userId);

    await alice.as.action(api.users.deleteAccount, {});

    expect(await ownedRows(t, alice.userId)).toEqual({});
    expect(await photosLeft(t, aliceData.photos)).toBe(0);
    expect(stripe.customers.del).toHaveBeenCalledExactlyOnceWith('cus_alice');

    expect(await ownedRows(t, bob.userId)).toEqual(bobBefore);
    expect(await photosLeft(t, bobData.photos)).toBe(bobData.photos.length);
    await t.run(async (ctx) => {
      expect((await ctx.db.get('stakes', bobData.armedStakeId))?.status).toBe('armed');
    });
  });

  test("cancels an armed stake's deadline before deleting it", async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const { resolveJobId } = await seed(t, alice.userId, 'alice');

    await alice.as.action(api.users.deleteAccount, {});

    await t.run(async (ctx) => {
      const job = await ctx.db.system.get('_scheduled_functions', resolveJobId);
      expect(job?.state.kind).toBe('canceled');
    });
  });

  test('refuses while a charge is going through, and changes nothing', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const { armedStakeId } = await seed(t, alice.userId, 'alice');
    await t.run(async (ctx) => {
      await ctx.db.insert('stakes', {
        kind: 'money',
        userId: alice.userId,
        title: 'Read',
        createdAt: 0,
        lostAt: 1,
        status: 'charging',
        amountCents: 500,
        stripeCustomerId: 'cus_alice',
        stripePaymentMethodId: 'pm_test',
      });
    });
    const before = await ownedRows(t, alice.userId);

    await expect(alice.as.action(api.users.deleteAccount, {})).rejects.toThrow(CHARGING_ERROR);

    expect(await ownedRows(t, alice.userId)).toEqual(before);
    expect(stripe.customers.del).not.toHaveBeenCalled();
    await t.run(async (ctx) => {
      expect((await ctx.db.get('stakes', armedStakeId))?.status).toBe('armed');
    });
    expect((await alice.as.query(api.accountDeletion.preview, {}))?.charging).toBe(true);
  });

  test('a declined stake is still owed but does not block deleting', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await t.run(async (ctx) => {
      return await ctx.db.insert('stakes', {
        kind: 'money',
        userId: alice.userId,
        title: 'Read',
        createdAt: 0,
        lostAt: 1,
        status: 'charge_failed',
        failureKind: 'declined',
        amountCents: 500,
        stripeCustomerId: 'cus_alice',
        stripePaymentMethodId: 'pm_test',
      });
    });

    expect(await alice.as.query(api.accountDeletion.preview, {})).toEqual({
      charging: false,
      owed: [{ stakeId, title: 'Read', amountCents: 500 }],
      armedMoneyCents: 0,
    });

    await alice.as.action(api.users.deleteAccount, {});
    expect(await ownedRows(t, alice.userId)).toEqual({});
  });

  test('purges more than one batch', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await t.run(async (ctx) => {
      const habitId = await ctx.db.insert('habits', {
        userId: alice.userId,
        title: 'Run',
        order: 0,
      });
      for (let i = 0; i < PURGE_BATCH * 2 + 5; i++) {
        await ctx.db.insert('habitCompletions', {
          userId: alice.userId,
          habitId,
          day: `2026-01-${String(i).padStart(3, '0')}`,
          completedAt: i,
        });
      }
    });

    await alice.as.action(api.users.deleteAccount, {});

    expect(await ownedRows(t, alice.userId)).toEqual({});
    expect(stripe.customers.del).not.toHaveBeenCalled();
  });

  test('a Stripe customer already gone counts as deleted', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await seed(t, alice.userId, 'alice');
    stripe.customers.del.mockRejectedValueOnce(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        code: 'resource_missing',
        message: 'No such customer',
      }),
    );

    await alice.as.action(api.users.deleteAccount, {});

    expect(await ownedRows(t, alice.userId)).toEqual({});
  });

  test('a Stripe outage stops it before anything is purged', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await seed(t, alice.userId, 'alice');
    stripe.customers.del.mockRejectedValueOnce(new Error('Could not reach Stripe'));

    await expect(alice.as.action(api.users.deleteAccount, {})).rejects.toThrow();
    expect((await ownedRows(t, alice.userId)).users).toBe(1);

    await alice.as.action(api.users.deleteAccount, {});
    expect(await ownedRows(t, alice.userId)).toEqual({});
  });
});
