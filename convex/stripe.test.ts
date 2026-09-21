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

async function stakeOf(t: Harness, goalId: Id<'goals'>) {
  return await t.run(async (ctx) => (await ctx.db.get('goals', goalId))?.stake);
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
      await ctx.db.patch('goals', goalId, { stake: { ...goal!.stake!, status: 'charging' } });
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
