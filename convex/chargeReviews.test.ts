import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { CONTEST_WINDOW_MS } from './chargeReviews';
import { setup as baseSetup, signIn, type Harness } from './test.helpers';

const PI = 'pi_contest';
const NOW = Date.UTC(2026, 9, 1, 12);

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

async function chargedStake(
  t: Harness,
  userId: Id<'users'>,
  fields: Partial<Extract<Doc<'stakes'>, { kind: 'money' }>> = {},
): Promise<Id<'stakes'>> {
  return await t.run(async (ctx) => {
    const habitId = await ctx.db.insert('habits', { userId, title: 'Run', order: 0 });
    return await ctx.db.insert('stakes', {
      kind: 'money',
      userId,
      habitId,
      title: 'Run',
      createdAt: 0,
      lostAt: NOW - 1000,
      amountCents: 2500,
      stripeCustomerId: 'cus_test',
      stripePaymentMethodId: 'pm_test',
      stripePaymentIntentId: PI,
      cardBrand: 'visa',
      cardLast4: '4242',
      status: 'charged',
      chargedAt: NOW - 1000,
      ...fields,
    });
  });
}

async function scheduled(t: Harness, name: string) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query('_scheduled_functions').collect();
    return jobs.filter((job) => job.name === name && job.state.kind === 'pending');
  });
}

async function reviews(t: Harness) {
  return await t.run(async (ctx) => await ctx.db.query('chargeReviews').collect());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('chargeReviews.request', () => {
  test('a contest is recorded once and support hears about it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await chargedStake(t, alice.userId);

    const first = await alice.as.mutation(api.chargeReviews.request, {
      stakeId,
      reason: 'proof_should_count',
      note: '  The photo shows the run.  ',
    });
    expect(first).toMatchObject({ status: 'open' });
    const again = await alice.as.mutation(api.chargeReviews.request, {
      stakeId,
      reason: 'other',
    });
    expect(again).toMatchObject({ status: 'open', createdAt: first.createdAt });

    expect(await reviews(t)).toMatchObject([
      { stakeId, reason: 'proof_should_count', note: 'The photo shows the run.', status: 'open' },
    ]);
    const jobs = await scheduled(t, 'emails:sendSupportCase');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({ stakeId, kind: 'contest' });
    expect(await alice.as.query(api.chargeReviews.forStake, { stakeId })).toMatchObject({
      status: 'open',
    });
  });

  test('claiming something serious came up takes a note', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await chargedStake(t, alice.userId);

    await expect(
      alice.as.mutation(api.chargeReviews.request, {
        stakeId,
        reason: 'something_came_up',
        note: '   ',
      }),
    ).rejects.toThrow(/what happened/);
    expect(await reviews(t)).toHaveLength(0);

    await alice.as.mutation(api.chargeReviews.request, {
      stakeId,
      reason: 'something_came_up',
      note: 'I was in the hospital that night.',
    });
    expect(await reviews(t)).toMatchObject([
      { stakeId, reason: 'something_came_up', note: 'I was in the hospital that night.' },
    ]);
    expect(await scheduled(t, 'emails:sendSupportCase')).toHaveLength(1);
  });

  test('another user can neither contest nor see it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const stakeId = await chargedStake(t, alice.userId);

    await expect(
      bob.as.mutation(api.chargeReviews.request, { stakeId, reason: 'dont_recognize' }),
    ).rejects.toThrow(/wasn’t found/);
    await alice.as.mutation(api.chargeReviews.request, { stakeId, reason: 'dont_recognize' });
    expect(await bob.as.query(api.chargeReviews.forStake, { stakeId })).toBeNull();
  });

  test('only money that went through, and only within the window', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const declined = await chargedStake(t, alice.userId, {
      status: 'charge_failed',
      failureKind: 'declined',
      chargedAt: undefined,
    });
    const refunded = await chargedStake(t, alice.userId, { status: 'refunded' });
    const old = await chargedStake(t, alice.userId, {
      chargedAt: NOW - CONTEST_WINDOW_MS - 1000,
    });

    await expect(
      alice.as.mutation(api.chargeReviews.request, { stakeId: declined, reason: 'other' }),
    ).rejects.toThrow(/went through/);
    await expect(
      alice.as.mutation(api.chargeReviews.request, { stakeId: refunded, reason: 'other' }),
    ).rejects.toThrow(/already refunded/);
    await expect(
      alice.as.mutation(api.chargeReviews.request, { stakeId: old, reason: 'other' }),
    ).rejects.toThrow(/too old/);
    expect(await reviews(t)).toHaveLength(0);
  });

  test('a refund closes the review and tells the user', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await chargedStake(t, alice.userId);
    await alice.as.mutation(api.chargeReviews.request, { stakeId, reason: 'app_problem' });
    await t.run(async (ctx) => {
      await ctx.db.insert('pushTokens', {
        userId: alice.userId,
        token: 'ExponentPushToken[alice]',
        permission: 'granted',
        updatedAt: NOW,
      });
    });

    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_refund',
      event: {
        type: 'charge.refunded',
        paymentIntentId: PI,
        stakeId,
        amountRefundedCents: 2500,
        fullyRefunded: true,
      },
    });

    expect(await reviews(t)).toMatchObject([{ status: 'refunded' }]);
    const pushes = await scheduled(t, 'push:send');
    expect(JSON.stringify(pushes.map((job) => job.args))).toContain(
      '$25 is on its way back to Visa ••4242',
    );
  });

  test('support can decline with a response', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await chargedStake(t, alice.userId);
    await alice.as.mutation(api.chargeReviews.request, { stakeId, reason: 'proof_should_count' });

    await t.mutation(internal.chargeReviews.decline, {
      stakeId,
      response: 'The photo was from the day before.',
    });

    expect(await alice.as.query(api.chargeReviews.forStake, { stakeId })).toMatchObject({
      status: 'declined',
      response: 'The photo was from the day before.',
    });
  });
});
