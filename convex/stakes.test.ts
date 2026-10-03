import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { EXTENSION_MS } from './lib/grace';
import { chargeIdempotencyKey, MONEY_BLOCKED_ERROR } from './lib/stakeRules';
import {
  apiError,
  cardDeclined,
  json,
  paymentIntent,
  SECRET_KEY,
  signedWebhook,
  stripeFake,
  WEBHOOK_SECRET,
  type StripeFake,
} from './stripeFake.helpers';
import { grantPro, setup as baseSetup, spendGrace, type Harness } from './test.helpers';

/**
 * The money path end to end, against a fake Stripe API behind `fetch`: a
 * money stake comes due (a habit's miss in the nightly check, a goal's
 * deadline), `stripe.chargeStake` creates the off-session PaymentIntent, and
 * signed webhooks through `/stripe/webhook` settle what happens after.
 */

// 2026-09-21 is a Monday. Everyone here lives in UTC, so the local day ends at 03:00Z.
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

let stripe: StripeFake;

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

/** A Pro user in UTC whose Stripe customer is `cus_test`, the one their cards are saved to. */
async function signIn(t: Harness, tokenIdentifier: string) {
  const as = t.withIdentity({
    tokenIdentifier,
    name: `${tokenIdentifier} Tester`,
    email: `${tokenIdentifier}@example.com`,
  });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  await t.mutation(internal.users.setStripeCustomerId, { userId, stripeCustomerId: 'cus_test' });
  return { as, userId };
}

async function moneyHabit(t: Harness, userId: Id<'users'>, amountCents = 2500) {
  return await t.mutation(internal.habits.insertStaked, {
    userId,
    title: 'Run',
    amountCents,
    stripeCustomerId: 'cus_test',
    stripePaymentMethodId: 'pm_test',
    stripeSetupIntentId: `seti_${Math.random()}`,
    cardBrand: 'visa',
    cardLast4: '4242',
  });
}

async function runCheck(t: Harness, day: string, hour = 4) {
  vi.setSystemTime(at(day, hour));
  await t.mutation(internal.lockouts.checkAll, {});
}

async function stakeOfHabit(t: Harness, habitId: Id<'habits'>) {
  return await t.run(async (ctx) => {
    const habit = await ctx.db.get('habits', habitId);
    return habit?.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
  });
}

async function stake(t: Harness, stakeId: Id<'stakes'>) {
  return await t.run(async (ctx) => await ctx.db.get('stakes', stakeId));
}

async function pending(t: Harness, name: string) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query('_scheduled_functions').collect();
    return jobs.filter((job) => job.name === name && job.state.kind === 'pending');
  });
}

/** Runs every scheduled function already due, wave by wave (charges, then what they schedule). */
async function runDue(t: Harness) {
  for (let wave = 0; wave < 20; wave += 1) {
    const due = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      return jobs.filter((job) => job.state.kind === 'pending' && job.scheduledTime <= Date.now())
        .length;
    });
    if (due === 0) return;
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
  }
}

/**
 * Moves the clock to `time` one job at a time, running each scheduled function
 * as it comes due, as the real scheduler would (never two at once).
 */
async function advanceTo(t: Harness, time: number) {
  for (let wave = 0; wave < 50; wave += 1) {
    const next = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      return jobs
        .filter((job) => job.state.kind === 'pending')
        .map((job) => job.scheduledTime)
        .sort((a, b) => a - b)[0];
    });
    if (next === undefined || next > time) break;
    vi.advanceTimersByTime(Math.max(0, next - Date.now()));
    await t.finishInProgressScheduledFunctions();
  }
  vi.advanceTimersByTime(Math.max(0, time - Date.now()));
}

async function webhook(
  t: Harness,
  event: { id: string; type: string; data: { object: Record<string, unknown> } },
) {
  return await t.fetch('/stripe/webhook', await signedWebhook(event));
}

const paymentIntentCreates = () => stripe.callsTo('POST', '/v1/payment_intents');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21'));
  vi.stubEnv('STAKES_V2', 'on');
  vi.stubEnv('STRIPE_SECRET_KEY', SECRET_KEY);
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
  stripe = stripeFake();
  vi.stubGlobal('fetch', stripe.fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('a missed money habit', () => {
  test('the first miss is let go by the one-time grace; the next is charged', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    stripe.on('POST', '/v1/payment_intents', () => json(paymentIntent('pi_1', 'succeeded')));

    await runCheck(t, '2026-09-23');
    await runDue(t);

    expect(await stakeOfHabit(t, habitId)).toMatchObject({ status: 'armed' });
    expect(await pending(t, 'stripe:chargeStake')).toHaveLength(0);
    expect(paymentIntentCreates()).toHaveLength(0);
    const graces = await t.run(async (ctx) => await ctx.db.query('graces').collect());
    expect(graces).toMatchObject([{ kind: 'waived', habitId, missedPeriod: '2026-09-22' }]);

    await runCheck(t, '2026-09-24');
    await runDue(t);

    expect(paymentIntentCreates()).toHaveLength(1);
    expect(await stakeOfHabit(t, habitId)).toMatchObject({
      status: 'charged',
      stripePaymentIntentId: 'pi_1',
    });
  });

  test('a miss charges the saved card off-session, exactly once', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await spendGrace(t, alice.userId);
    const habitId = await moneyHabit(t, alice.userId);
    stripe.on('POST', '/v1/payment_intents', () => json(paymentIntent('pi_1', 'succeeded')));

    await runCheck(t, '2026-09-23');
    const claimed = await stakeOfHabit(t, habitId);
    expect(claimed).toMatchObject({ status: 'charging' });
    expect(await pending(t, 'stripe:chargeStake')).toMatchObject([
      { args: [{ stakeId: claimed!._id, attempt: 0 }] },
    ]);

    await runDue(t);

    const [call] = paymentIntentCreates();
    expect(Object.fromEntries(call.params)).toMatchObject({
      amount: '2500',
      currency: 'usd',
      customer: 'cus_test',
      payment_method: 'pm_test',
      off_session: 'true',
      confirm: 'true',
      description: 'Ante stake: Run',
      receipt_email: 'alice@example.com',
      'metadata[stakeId]': claimed!._id,
      'metadata[habitId]': habitId,
    });
    expect(call.params.get('statement_descriptor_suffix')).toBeTruthy();
    expect(call.idempotencyKey).toBe(chargeIdempotencyKey(claimed!));

    const charged = await stake(t, claimed!._id);
    expect(charged).toMatchObject({ status: 'charged', stripePaymentIntentId: 'pi_1' });
    expect(charged?.kind === 'money' && charged.chargedAt).toBeTruthy();
    expect(await alice.as.query(api.stakes.unseenLoss, {})).toMatchObject({
      title: 'Run',
      stake: { kind: 'money', status: 'charged', amountCents: 2500 },
    });

    // A second run of the job (a retry, or one that fired twice) finds it settled.
    await t.action(internal.stripe.chargeStake, { stakeId: claimed!._id, attempt: 0 });
    // So does the next night's check.
    await runCheck(t, '2026-09-24');
    await runDue(t);
    expect(paymentIntentCreates()).toHaveLength(1);
  });

  test('a charge still processing lands with the payment_intent.succeeded webhook', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await spendGrace(t, alice.userId);
    const habitId = await moneyHabit(t, alice.userId);
    stripe.on('POST', '/v1/payment_intents', () => json(paymentIntent('pi_slow', 'processing')));

    await runCheck(t, '2026-09-23');
    await runDue(t);

    const processing = await stakeOfHabit(t, habitId);
    expect(processing).toMatchObject({ status: 'charging', stripePaymentIntentId: 'pi_slow' });
    // The loss screen waits until the money actually moved.
    expect(await alice.as.query(api.stakes.unseenLoss, {})).toBeNull();

    const response = await webhook(t, {
      id: 'evt_succeeded',
      type: 'payment_intent.succeeded',
      data: {
        object: paymentIntent('pi_slow', 'succeeded', { metadata: { stakeId: processing!._id } }),
      },
    });

    expect(response.status).toBe(200);
    expect(await stake(t, processing!._id)).toMatchObject({ status: 'charged' });
    expect(await alice.as.query(api.stakes.unseenLoss, {})).toMatchObject({
      stake: { status: 'charged' },
    });
  });

  test('a processing charge that fails later is owed, from the payment_failed webhook', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await spendGrace(t, alice.userId);
    const habitId = await moneyHabit(t, alice.userId);
    stripe.on('POST', '/v1/payment_intents', () => json(paymentIntent('pi_slow', 'processing')));
    await runCheck(t, '2026-09-23');
    await runDue(t);
    const processing = await stakeOfHabit(t, habitId);

    await webhook(t, {
      id: 'evt_failed',
      type: 'payment_intent.payment_failed',
      data: {
        object: paymentIntent('pi_slow', 'requires_payment_method', {
          metadata: { stakeId: processing!._id },
          last_payment_error: { code: 'card_declined', decline_code: 'generic_decline' },
        }),
      },
    });

    expect(await stake(t, processing!._id)).toMatchObject({
      status: 'charge_failed',
      failureKind: 'declined',
      failureReason: 'generic_decline',
    });
  });

  test('a decline is owed without turning money off, and settling up clears it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await spendGrace(t, alice.userId);
    const habitId = await moneyHabit(t, alice.userId);
    stripe.on('POST', '/v1/payment_intents', () => cardDeclined('pi_declined'));

    await runCheck(t, '2026-09-23');
    await runDue(t);

    const declined = await stakeOfHabit(t, habitId);
    expect(declined).toMatchObject({
      status: 'charge_failed',
      failureKind: 'declined',
      failureReason: 'insufficient_funds',
      stripePaymentIntentId: 'pi_declined',
    });
    // Still owed, but a decline isn't a chargeback: money stakes stay on.
    const user = await t.run(async (ctx) => await ctx.db.get('users', alice.userId));
    expect(user?.moneyBlocked).toBeUndefined();
    expect(await alice.as.query(api.stakes.headroom, {})).toMatchObject({ blocked: false });
    expect(await alice.as.query(api.accountDeletion.preview, {})).toMatchObject({
      owed: [{ stakeId: declined!._id, amountCents: 2500 }],
    });

    // Settling up: an on-session intent the PaymentSheet confirms…
    stripe.on('POST', '/v1/customer_sessions', () =>
      json({ object: 'customer_session', client_secret: 'cuss_secret' }),
    );
    stripe.on('POST', '/v1/payment_intents', () =>
      json(paymentIntent('pi_settle', 'requires_confirmation')),
    );
    const sheet = await alice.as.action(api.stakes.settleUp, { stakeId: declined!._id });
    expect(sheet).toMatchObject({
      customerId: 'cus_test',
      paymentIntentClientSecret: 'pi_settle_secret_x',
      amountCents: 2500,
    });
    const settleCall = paymentIntentCreates().at(-1)!;
    expect(settleCall.params.get('off_session')).toBeNull();
    expect(settleCall.params.get('metadata[settleUp]')).toBe('1');
    expect(await stake(t, declined!._id)).toMatchObject({ settleUpPaymentIntentId: 'pi_settle' });

    // …and only Stripe's copy of it is trusted.
    stripe.on('GET', '/v1/payment_intents/pi_settle', () =>
      json(paymentIntent('pi_settle', 'requires_action')),
    );
    expect(await alice.as.action(api.stakes.confirmSettleUp, { stakeId: declined!._id })).toEqual({
      settled: false,
    });
    stripe.on('GET', '/v1/payment_intents/pi_settle', () =>
      json(paymentIntent('pi_settle', 'succeeded')),
    );
    expect(await alice.as.action(api.stakes.confirmSettleUp, { stakeId: declined!._id })).toEqual({
      settled: true,
    });

    const settled = await stake(t, declined!._id);
    expect(settled).toMatchObject({ status: 'charged', stripePaymentIntentId: 'pi_settle' });
    expect(settled).not.toHaveProperty('failureKind');
    await expect(alice.as.action(api.stakes.settleUp, { stakeId: declined!._id })).rejects.toThrow(
      'Nothing is owed on this stake',
    );
  });

  test('a Stripe outage retries, then gives up as our error, not a decline', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await spendGrace(t, alice.userId);
    const habitId = await moneyHabit(t, alice.userId);
    stripe.on('POST', '/v1/payment_intents', () => apiError());

    await runCheck(t, '2026-09-23');
    await runDue(t);
    const stakeId = (await stakeOfHabit(t, habitId))!._id;
    expect(await stake(t, stakeId)).toMatchObject({ status: 'charging' });
    expect(await pending(t, 'stripe:chargeStake')).toMatchObject([
      { args: [{ stakeId, attempt: 1 }] },
    ]);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      vi.advanceTimersByTime(5 * MINUTE_MS);
      await t.finishInProgressScheduledFunctions();
    }

    expect(paymentIntentCreates()).toHaveLength(3);
    // Every attempt reuses one idempotency key, so a charge that went through unseen never doubles.
    expect(new Set(paymentIntentCreates().map((call) => call.idempotencyKey)).size).toBe(1);
    expect(await stake(t, stakeId)).toMatchObject({
      status: 'charge_failed',
      failureKind: 'error',
      failureReason: 'Could not reach Stripe',
    });
    // Our failure isn't theirs to settle up.
    await expect(alice.as.action(api.stakes.settleUp, { stakeId })).rejects.toThrow(
      'Nothing is owed on this stake',
    );
  });

  test('a full refund marks the stake refunded and closes the contest', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await spendGrace(t, alice.userId);
    const habitId = await moneyHabit(t, alice.userId);
    stripe.on('POST', '/v1/payment_intents', () => json(paymentIntent('pi_1', 'succeeded')));
    await runCheck(t, '2026-09-23');
    await runDue(t);
    const stakeId = (await stakeOfHabit(t, habitId))!._id;

    await alice.as.mutation(api.chargeReviews.request, {
      stakeId,
      reason: 'proof_should_count',
      note: 'I ran, the photo was rejected by mistake',
    });
    expect(await pending(t, 'emails:sendSupportCase')).toMatchObject([
      { args: [{ stakeId, kind: 'contest' }] },
    ]);

    const charge = (amountRefunded: number, refunded: boolean) => ({
      id: 'ch_1',
      object: 'charge',
      payment_intent: 'pi_1',
      metadata: { stakeId },
      amount_refunded: amountRefunded,
      refunded,
    });

    // A partial refund is recorded but changes nothing else.
    await webhook(t, {
      id: 'evt_partial',
      type: 'charge.refunded',
      data: { object: charge(1000, false) },
    });
    expect(await stake(t, stakeId)).toMatchObject({ status: 'charged', refundedCents: 1000 });
    expect(await alice.as.query(api.chargeReviews.forStake, { stakeId })).toMatchObject({
      status: 'open',
    });

    await webhook(t, {
      id: 'evt_full',
      type: 'charge.refunded',
      data: { object: charge(2500, true) },
    });
    expect(await stake(t, stakeId)).toMatchObject({ status: 'refunded', refundedCents: 2500 });
    expect(await alice.as.query(api.chargeReviews.forStake, { stakeId })).toMatchObject({
      status: 'refunded',
    });
    expect(await alice.as.query(api.stakes.totals, {})).toMatchObject({ lostCents: 0 });
  });

  test('a chargeback turns money stakes off', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await spendGrace(t, alice.userId);
    const habitId = await moneyHabit(t, alice.userId);
    stripe.on('POST', '/v1/payment_intents', () => json(paymentIntent('pi_1', 'succeeded')));
    await runCheck(t, '2026-09-23');
    await runDue(t);
    const stakeId = (await stakeOfHabit(t, habitId))!._id;

    await webhook(t, {
      id: 'evt_dispute',
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_1', object: 'dispute', payment_intent: 'pi_1' } },
    });

    expect(await stake(t, stakeId)).toMatchObject({ status: 'disputed', stripeDisputeId: 'dp_1' });
    const user = await t.run(async (ctx) => await ctx.db.get('users', alice.userId));
    expect(user?.moneyBlocked).toMatchObject({ reason: 'dispute' });
    expect(await alice.as.query(api.stakes.headroom, {})).toMatchObject({ blocked: true });
    await expect(moneyHabit(t, alice.userId)).rejects.toThrow(MONEY_BLOCKED_ERROR);
  });
});

describe('a missed money goal', () => {
  /** A goal with money on it through the real `createStaked`, Stripe confirming the saved card. */
  async function moneyGoal(
    t: Harness,
    as: Awaited<ReturnType<typeof signIn>>['as'],
    userId: Id<'users'>,
    dueAt: number,
  ): Promise<{ goalId: Id<'goals'>; stakeId: Id<'stakes'> }> {
    stripe.on('GET', '/v1/setup_intents/seti_goal', () =>
      json({
        id: 'seti_goal',
        object: 'setup_intent',
        status: 'succeeded',
        customer: 'cus_test',
        metadata: { userId, amountCents: '5000' },
        payment_method: {
          id: 'pm_goal',
          object: 'payment_method',
          customer: 'cus_test',
          card: { brand: 'visa', last4: '4242', fingerprint: 'fp_1' },
        },
      }),
    );
    stripe.on('POST', '/v1/payment_methods/pm_goal', () =>
      json({ id: 'pm_goal', object: 'payment_method' }),
    );
    const goalId = await as.action(api.goals.createStaked, {
      title: 'Ship the app',
      description: 'A screenshot of the App Store listing',
      dueAt,
      amountCents: 5000,
      setupIntentId: 'seti_goal',
    });
    const goal = await t.run(async (ctx) => await ctx.db.get('goals', goalId));
    return { goalId, stakeId: goal!.stakeId! };
  }

  async function goal(t: Harness, goalId: Id<'goals'>): Promise<Doc<'goals'> | null> {
    return await t.run(async (ctx) => await ctx.db.get('goals', goalId));
  }

  test('the first deadline moves 48 hours instead of charging; the next one charges', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const dueAt = at('2026-09-25').getTime();
    const { goalId, stakeId } = await moneyGoal(t, alice.as, alice.userId, dueAt);
    expect(await stake(t, stakeId)).toMatchObject({
      kind: 'money',
      status: 'armed',
      amountCents: 5000,
      stripePaymentMethodId: 'pm_goal',
      cardFingerprint: 'fp_1',
    });
    expect(
      stripe.callsTo('POST', '/v1/payment_methods/pm_goal')[0]?.params.get('allow_redisplay'),
    ).toBe('always');
    stripe.on('POST', '/v1/payment_intents', () => json(paymentIntent('pi_goal', 'succeeded')));

    // The deadline job fires.
    await advanceTo(t, dueAt);

    expect(paymentIntentCreates()).toHaveLength(0);
    expect(await stake(t, stakeId)).toMatchObject({ status: 'armed' });
    expect(await goal(t, goalId)).toMatchObject({
      dueAt: dueAt + EXTENSION_MS,
      originalDueAt: dueAt,
    });

    // The moved deadline passes unproven too.
    await advanceTo(t, dueAt + EXTENSION_MS);

    const [call] = paymentIntentCreates();
    expect(call.params.get('amount')).toBe('5000');
    expect(call.params.get('metadata[goalId]')).toBe(goalId);
    expect(call.idempotencyKey).toBe(`goal-settle-${goalId}`);
    expect(await stake(t, stakeId)).toMatchObject({
      status: 'charged',
      stripePaymentIntentId: 'pi_goal',
    });
  });

  test('proof in time lets the money go and nothing is charged', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await spendGrace(t, alice.userId);
    const dueAt = at('2026-09-25').getTime();
    const { goalId, stakeId } = await moneyGoal(t, alice.as, alice.userId, dueAt);
    await t.run(
      async (ctx) => await ctx.db.patch('goals', goalId, { completedAt: dueAt - HOUR_MS }),
    );

    await advanceTo(t, dueAt);

    expect(paymentIntentCreates()).toHaveLength(0);
    expect(await stake(t, stakeId)).toMatchObject({ status: 'released' });
  });
});
