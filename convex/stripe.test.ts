import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { setup, signIn, type Harness } from './test.helpers';

const PI = 'pi_test_123';

async function insertStakedGoal(
  t: Harness,
  userId: Id<'users'>,
  stake: Partial<NonNullable<Doc<'goals'>['stake']>>,
): Promise<Id<'goals'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('goals', {
      userId,
      title: 'Ship',
      dueAt: Date.now() - 1000,
      order: 0,
      stake: {
        amountCents: 500,
        stripeCustomerId: 'cus_test',
        stripePaymentMethodId: 'pm_test',
        stripeSetupIntentId: 'seti_test',
        status: 'charging',
        ...stake,
      },
    });
  });
}

/** The goal's money, wherever it lives: its own row once touched, else still on the goal. */
async function stakeOf(t: Harness, goalId: Id<'goals'>) {
  return await t.run(async (ctx) => {
    const goal = await ctx.db.get('goals', goalId);
    if (goal?.stakeId !== undefined) return await ctx.db.get('stakes', goal.stakeId);
    return goal?.stake;
  });
}

async function insertHabitStake(
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
      lostAt: 1,
      amountCents: 1000,
      stripeCustomerId: 'cus_test',
      stripePaymentMethodId: 'pm_test',
      status: 'charging',
      ...fields,
    });
  });
}

describe('stripe.handleEvent', () => {
  test('payment_intent.succeeded settles a charging stake', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await insertStakedGoal(t, alice.userId, {});

    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_1',
      event: { type: 'payment_intent.succeeded', paymentIntentId: PI, goalId },
    });

    expect(await stakeOf(t, goalId)).toMatchObject({
      status: 'charged',
      stripePaymentIntentId: PI,
    });
  });

  test('payment_intent.payment_failed records the decline', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await insertStakedGoal(t, alice.userId, {});

    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_1',
      event: {
        type: 'payment_intent.payment_failed',
        paymentIntentId: PI,
        goalId,
        reason: 'insufficient_funds',
      },
    });

    expect(await stakeOf(t, goalId)).toMatchObject({
      status: 'charge_failed',
      failureReason: 'insufficient_funds',
    });
  });

  test('a redelivered event is a no-op', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await insertStakedGoal(t, alice.userId, {});

    const event = { type: 'payment_intent.succeeded' as const, paymentIntentId: PI, goalId };
    await t.mutation(internal.stripe.handleEvent, { eventId: 'evt_1', event });
    // Rewind the stake by hand: if the id were not deduped, this would re-charge.
    await t.run(async (ctx) => {
      const goal = await ctx.db.get('goals', goalId);
      await ctx.db.patch('stakes', goal!.stakeId!, { status: 'charging' });
    });
    await t.mutation(internal.stripe.handleEvent, { eventId: 'evt_1', event });

    expect(await stakeOf(t, goalId)).toMatchObject({ status: 'charging' });
    const seen = await t.run(async (ctx) => await ctx.db.query('stripeEvents').collect());
    expect(seen).toHaveLength(1);
  });

  test('a full refund is found through the PaymentIntent when metadata is missing', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await insertStakedGoal(t, alice.userId, {
      status: 'charged',
      stripePaymentIntentId: PI,
    });

    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_refund',
      event: {
        type: 'charge.refunded',
        paymentIntentId: PI,
        amountRefundedCents: 500,
        fullyRefunded: true,
      },
    });

    expect(await stakeOf(t, goalId)).toMatchObject({ status: 'refunded', refundedCents: 500 });
  });

  test('a dispute only applies to money that moved', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const armed = await insertStakedGoal(t, alice.userId, {
      status: 'armed',
      stripePaymentIntentId: 'pi_other',
    });
    const charged = await insertStakedGoal(t, alice.userId, {
      status: 'charged',
      stripePaymentIntentId: PI,
    });

    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_d1',
      event: { type: 'charge.dispute.created', paymentIntentId: 'pi_other', disputeId: 'dp_1' },
    });
    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_d2',
      event: { type: 'charge.dispute.created', paymentIntentId: PI, disputeId: 'dp_2' },
    });

    expect(await stakeOf(t, armed)).toMatchObject({ status: 'armed' });
    expect(await stakeOf(t, charged)).toMatchObject({
      status: 'disputed',
      stripeDisputeId: 'dp_2',
    });
  });

  test('a goal stake moves to its own row the first time an event touches it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await insertStakedGoal(t, alice.userId, {});

    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_1',
      event: { type: 'payment_intent.succeeded', paymentIntentId: PI, goalId },
    });

    const goal = await t.run(async (ctx) => await ctx.db.get('goals', goalId));
    expect(goal?.stake).toBeUndefined();
    expect(await stakeOf(t, goalId)).toMatchObject({
      kind: 'money',
      goalId,
      amountCents: 500,
      status: 'charged',
    });
  });

  test('a habit charge is found by its stake id', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await insertHabitStake(t, alice.userId);

    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_1',
      event: { type: 'payment_intent.succeeded', paymentIntentId: PI, stakeId },
    });

    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'charged',
      stripePaymentIntentId: PI,
    });
  });

  test('a settle-up payment clears a declined stake', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await insertHabitStake(t, alice.userId, {
      status: 'charge_failed',
      failureKind: 'declined',
      stripePaymentIntentId: 'pi_declined',
      settleUpPaymentIntentId: 'pi_settle',
    });

    // The failed intent succeeding later would also count; an unrelated one would not.
    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_other',
      event: { type: 'payment_intent.succeeded', paymentIntentId: 'pi_other', stakeId },
    });
    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'charge_failed',
    });

    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_settle',
      event: { type: 'payment_intent.succeeded', paymentIntentId: 'pi_settle', stakeId },
    });
    const settled = await t.run(async (ctx) => await ctx.db.get('stakes', stakeId));
    expect(settled).toMatchObject({ status: 'charged' });
    expect(settled).not.toHaveProperty('failureKind');
  });

  test('a decline from the webhook is still owed but doesn’t block new money', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await insertHabitStake(t, alice.userId);

    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_1',
      event: {
        type: 'payment_intent.payment_failed',
        paymentIntentId: PI,
        stakeId,
        reason: 'card_declined',
      },
    });

    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'charge_failed',
      failureKind: 'declined',
    });
    const problem = await t.query(internal.stakes.moneyProblem, {
      userId: alice.userId,
      amountCents: 500,
      now: Date.now(),
    });
    expect(problem).toBeNull();
  });

  test('an unknown goal is recorded and ignored', async () => {
    const t = setup();
    await t.mutation(internal.stripe.handleEvent, {
      eventId: 'evt_stray',
      event: { type: 'payment_intent.succeeded', paymentIntentId: 'pi_none', goalId: 'nope' },
    });
    const seen = await t.run(async (ctx) => await ctx.db.query('stripeEvents').collect());
    expect(seen).toMatchObject([{ eventId: 'evt_stray' }]);
  });
});
