import { v } from 'convex/values';
import Stripe from 'stripe';

import { internal } from './_generated/api';
import { internalAction, internalMutation } from './_generated/server';
import { stripeClient } from './lib/stripe';

/**
 * Settlement: charging the saved card when a staked goal reaches its deadline
 * uncompleted. `settle` is scheduled by `goals.insertStaked` for `dueAt`.
 *
 * The action never decides on its own. `claimSettlement` is the transaction
 * that checks the goal and flips the stake to `charging`, so a second run of
 * the action (a retry, or a job that fired twice) cannot charge twice — and the
 * Stripe idempotency key covers the window where the claim went through but
 * the result was never recorded.
 */

/** How long to wait for a submission that was still being verified at the deadline. */
const PENDING_GRACE_MS = 3 * 60 * 1000;
const MAX_PENDING_WAITS = 3;

/** Backoff for a Stripe outage (not for declines, which are final). */
const RETRY_AFTER_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const claimValidator = v.union(
  v.object({
    kind: v.literal('charge'),
    amountCents: v.number(),
    customerId: v.string(),
    paymentMethodId: v.string(),
    title: v.string(),
  }),
  v.object({ kind: v.literal('skip') }),
);

type Claim =
  | {
      kind: 'charge';
      amountCents: number;
      customerId: string;
      paymentMethodId: string;
      title: string;
    }
  | { kind: 'skip' };

export const settle = internalAction({
  args: { goalId: v.id('goals'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const claim: Claim = await ctx.runMutation(internal.stripe.claimSettlement, args);
    if (claim.kind === 'skip') {
      return null;
    }

    try {
      const paymentIntent = await stripeClient().paymentIntents.create(
        {
          amount: claim.amountCents,
          currency: 'usd',
          customer: claim.customerId,
          payment_method: claim.paymentMethodId,
          off_session: true,
          confirm: true,
          description: `Ante stake: ${claim.title}`.slice(0, 200),
          metadata: { goalId: args.goalId },
        },
        { idempotencyKey: `goal-settle-${args.goalId}` },
      );

      if (paymentIntent.status === 'succeeded') {
        await ctx.runMutation(internal.stripe.recordCharge, {
          goalId: args.goalId,
          paymentIntentId: paymentIntent.id,
        });
      } else {
        await ctx.runMutation(internal.stripe.recordFailure, {
          goalId: args.goalId,
          paymentIntentId: paymentIntent.id,
          reason: `Payment ${paymentIntent.status.replace(/_/g, ' ')}`,
        });
      }
    } catch (error: unknown) {
      if (error instanceof Stripe.errors.StripeCardError) {
        // A decline is the card's final word; the user has to sort it out.
        await ctx.runMutation(internal.stripe.recordFailure, {
          goalId: args.goalId,
          paymentIntentId: error.payment_intent?.id,
          reason: error.decline_code ?? error.code ?? error.message,
        });
      } else if (args.attempt + 1 < MAX_ATTEMPTS) {
        console.error('Settlement failed, retrying', error);
        await ctx.scheduler.runAfter(RETRY_AFTER_MS, internal.stripe.settle, {
          goalId: args.goalId,
          attempt: args.attempt + 1,
        });
      } else {
        console.error('Settlement gave up', error);
        await ctx.runMutation(internal.stripe.recordFailure, {
          goalId: args.goalId,
          reason: 'Could not reach Stripe',
        });
      }
    }

    return null;
  },
});

/**
 * Decides whether this run should charge. Waits (by rescheduling itself) while
 * a submission made before the deadline is still being verified, so a photo
 * sent at the last second gets its verdict before the card does.
 */
export const claimSettlement = internalMutation({
  args: { goalId: v.id('goals'), attempt: v.number() },
  returns: claimValidator,
  handler: async (ctx, args): Promise<Claim> => {
    const goal = await ctx.db.get('goals', args.goalId);
    if (goal === null || goal.stake === undefined) {
      return { kind: 'skip' };
    }

    const { stake } = goal;
    if (goal.completedAt !== undefined) {
      if (stake.status === 'armed') {
        await ctx.db.patch('goals', goal._id, {
          stake: { ...stake, status: 'released', settleJobId: undefined },
        });
      }
      return { kind: 'skip' };
    }

    if (stake.status !== 'armed' && stake.status !== 'charging') {
      return { kind: 'skip' };
    }

    const latest = await ctx.db
      .query('goalSubmissions')
      .withIndex('by_goal', (q) => q.eq('goalId', goal._id))
      .order('desc')
      .first();
    if (latest?.status === 'pending' && args.attempt < MAX_PENDING_WAITS) {
      const settleJobId = await ctx.scheduler.runAfter(PENDING_GRACE_MS, internal.stripe.settle, {
        goalId: goal._id,
        attempt: args.attempt + 1,
      });
      await ctx.db.patch('goals', goal._id, { stake: { ...stake, settleJobId } });
      return { kind: 'skip' };
    }

    await ctx.db.patch('goals', goal._id, {
      stake: { ...stake, status: 'charging', settleJobId: undefined },
    });

    return {
      kind: 'charge',
      amountCents: stake.amountCents,
      customerId: stake.stripeCustomerId,
      paymentMethodId: stake.stripePaymentMethodId,
      title: goal.title,
    };
  },
});

export const recordCharge = internalMutation({
  args: { goalId: v.id('goals'), paymentIntentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const goal = await ctx.db.get('goals', args.goalId);
    if (goal?.stake === undefined || goal.stake.status !== 'charging') {
      return null;
    }

    await ctx.db.patch('goals', goal._id, {
      stake: {
        ...goal.stake,
        status: 'charged',
        stripePaymentIntentId: args.paymentIntentId,
        chargedAt: Date.now(),
      },
    });

    return null;
  },
});

export const recordFailure = internalMutation({
  args: {
    goalId: v.id('goals'),
    reason: v.string(),
    paymentIntentId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const goal = await ctx.db.get('goals', args.goalId);
    if (goal?.stake === undefined || goal.stake.status !== 'charging') {
      return null;
    }

    await ctx.db.patch('goals', goal._id, {
      stake: {
        ...goal.stake,
        status: 'charge_failed',
        stripePaymentIntentId: args.paymentIntentId,
        failureReason: args.reason,
      },
    });

    return null;
  },
});
