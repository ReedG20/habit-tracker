import { v } from 'convex/values';
import Stripe from 'stripe';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction, internalMutation, type MutationCtx } from './_generated/server';
import { notifyCharged, notifyDeclined } from './lib/notify';
import { chargeIdempotencyKey } from './lib/stakeRules';
import { materializeGoalStake } from './lib/stakes';
import { stripeClient } from './lib/stripe';

/**
 * Charging a money stake that came due: a goal's deadline passed unproven
 * (`stakes.resolveGoal`) or a habit's streak broke (`habitChecks.checkUser`).
 * Both claim the stake by flipping it to `charging` in the transaction that
 * found the miss, then schedule `chargeStake`.
 *
 * The action never decides on its own. `claimCharge` re-reads the stake, so a
 * second run (a retry, or a job that fired twice) finds it already settled,
 * and the Stripe idempotency key covers the window where the charge went
 * through but the result was never recorded.
 */

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
    idempotencyKey: v.string(),
    metadata: v.record(v.string(), v.string()),
  }),
  v.object({ kind: v.literal('skip') }),
);

type Claim = typeof claimValidator.type;

/**
 * Jobs scheduled before stakes had their own table still call this with a
 * goal id at the deadline; it hands them to the stake's deadline logic.
 */
export const settle = internalAction({
  args: { goalId: v.id('goals'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.stakes.resolveLegacyGoal, args);
    return null;
  },
});

export const chargeStake = internalAction({
  args: { stakeId: v.id('stakes'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const claim: Claim = await ctx.runMutation(internal.stripe.claimCharge, {
      stakeId: args.stakeId,
    });
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
          metadata: claim.metadata,
        },
        { idempotencyKey: claim.idempotencyKey },
      );

      if (paymentIntent.status === 'succeeded') {
        await ctx.runMutation(internal.stripe.recordCharge, {
          stakeId: args.stakeId,
          paymentIntentId: paymentIntent.id,
        });
      } else if (paymentIntent.status === 'processing') {
        // Still moving; the webhook reports how it ends.
        await ctx.runMutation(internal.stripe.recordProcessing, {
          stakeId: args.stakeId,
          paymentIntentId: paymentIntent.id,
        });
      } else {
        // `requires_action` and the like: the bank wants the user present.
        await ctx.runMutation(internal.stripe.recordFailure, {
          stakeId: args.stakeId,
          paymentIntentId: paymentIntent.id,
          reason: `Payment ${paymentIntent.status.replace(/_/g, ' ')}`,
          failureKind: 'declined',
        });
      }
    } catch (error: unknown) {
      if (error instanceof Stripe.errors.StripeCardError) {
        // A decline is the card's final word; the user has to settle up.
        await ctx.runMutation(internal.stripe.recordFailure, {
          stakeId: args.stakeId,
          paymentIntentId: error.payment_intent?.id,
          reason: error.decline_code ?? error.code ?? error.message,
          failureKind: 'declined',
        });
      } else if (args.attempt + 1 < MAX_ATTEMPTS) {
        console.error('Charge failed, retrying', error);
        await ctx.scheduler.runAfter(RETRY_AFTER_MS, internal.stripe.chargeStake, {
          stakeId: args.stakeId,
          attempt: args.attempt + 1,
        });
      } else {
        console.error('Charge gave up', error);
        await ctx.runMutation(internal.stripe.recordFailure, {
          stakeId: args.stakeId,
          reason: 'Could not reach Stripe',
          failureKind: 'error',
        });
      }
    }

    return null;
  },
});

/** Hands the action what to charge, only while the stake is still claimed for it. */
export const claimCharge = internalMutation({
  args: { stakeId: v.id('stakes') },
  returns: claimValidator,
  handler: async (ctx, args): Promise<Claim> => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake === null || stake.kind !== 'money' || stake.status !== 'charging') {
      return { kind: 'skip' };
    }

    const metadata: Record<string, string> = { stakeId: stake._id };
    if (stake.goalId !== undefined) metadata.goalId = stake.goalId;
    if (stake.habitId !== undefined) metadata.habitId = stake.habitId;

    return {
      kind: 'charge',
      amountCents: stake.amountCents,
      customerId: stake.stripeCustomerId,
      paymentMethodId: stake.stripePaymentMethodId,
      title: stake.title,
      idempotencyKey: chargeIdempotencyKey(stake),
      metadata,
    };
  },
});

export const recordCharge = internalMutation({
  args: { stakeId: v.id('stakes'), paymentIntentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake !== null) {
      await markCharged(ctx, stake, args.paymentIntentId);
    }
    return null;
  },
});

export const recordProcessing = internalMutation({
  args: { stakeId: v.id('stakes'), paymentIntentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake?.kind === 'money' && stake.status === 'charging') {
      await ctx.db.patch('stakes', stake._id, { stripePaymentIntentId: args.paymentIntentId });
    }
    return null;
  },
});

const failureKindValidator = v.union(v.literal('declined'), v.literal('error'));

export const recordFailure = internalMutation({
  args: {
    stakeId: v.id('stakes'),
    reason: v.string(),
    failureKind: failureKindValidator,
    paymentIntentId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake !== null) {
      await markFailed(ctx, stake, args.reason, args.failureKind, args.paymentIntentId);
    }
    return null;
  },
});

/** Remembers the on-session intent a declined stake is being settled with. */
export const recordSettleUpIntent = internalMutation({
  args: { stakeId: v.id('stakes'), paymentIntentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake?.kind === 'money' && stake.status === 'charge_failed') {
      await ctx.db.patch('stakes', stake._id, { settleUpPaymentIntentId: args.paymentIntentId });
    }
    return null;
  },
});

/**
 * `charging` → `charged`. Also accepts `charge_failed` for the same
 * PaymentIntent (a `processing` charge the webhook later confirms) or for the
 * settle-up intent that paid off a decline.
 */
async function markCharged(
  ctx: MutationCtx,
  stake: Doc<'stakes'>,
  paymentIntentId: string,
): Promise<void> {
  if (stake.kind !== 'money') return;
  const reconcilable =
    stake.status === 'charging' ||
    (stake.status === 'charge_failed' &&
      (stake.stripePaymentIntentId === paymentIntentId ||
        stake.settleUpPaymentIntentId === paymentIntentId));
  if (!reconcilable) return;

  await ctx.db.patch('stakes', stake._id, {
    status: 'charged',
    stripePaymentIntentId: paymentIntentId,
    chargedAt: Date.now(),
    failureReason: undefined,
    failureKind: undefined,
  });
  await notifyCharged(ctx, stake);
}

/** `charging` → `charge_failed`. */
async function markFailed(
  ctx: MutationCtx,
  stake: Doc<'stakes'>,
  reason: string,
  failureKind: 'declined' | 'error',
  paymentIntentId?: string,
): Promise<void> {
  if (stake.kind !== 'money' || stake.status !== 'charging') return;

  await ctx.db.patch('stakes', stake._id, {
    status: 'charge_failed',
    stripePaymentIntentId: paymentIntentId,
    failureReason: reason,
    failureKind,
  });
  if (failureKind === 'declined') {
    await notifyDeclined(ctx, stake);
  }
}

/**
 * What `http.ts` extracts from a verified Stripe event: only the fields the
 * state machine needs, never the raw payload. `stakeId` (and, on charges made
 * before stakes had their own rows, `goalId`) is the PaymentIntent metadata,
 * copied onto its Charge; disputes carry no metadata and are found through
 * the PaymentIntent id instead.
 */
export const webhookEventValidator = v.union(
  v.object({
    type: v.literal('payment_intent.succeeded'),
    paymentIntentId: v.string(),
    stakeId: v.optional(v.string()),
    goalId: v.optional(v.string()),
  }),
  v.object({
    type: v.literal('payment_intent.payment_failed'),
    paymentIntentId: v.string(),
    stakeId: v.optional(v.string()),
    goalId: v.optional(v.string()),
    reason: v.string(),
  }),
  v.object({
    type: v.literal('charge.refunded'),
    paymentIntentId: v.optional(v.string()),
    stakeId: v.optional(v.string()),
    goalId: v.optional(v.string()),
    amountRefundedCents: v.number(),
    fullyRefunded: v.boolean(),
  }),
  v.object({
    type: v.literal('charge.dispute.created'),
    paymentIntentId: v.optional(v.string()),
    disputeId: v.string(),
  }),
);

/**
 * Applies one webhook event. Dedupe and the state change share a transaction:
 * a redelivery either sees the `stripeEvents` row and stops, or conflicts with
 * the first delivery and is retried against the committed state.
 */
export const handleEvent = internalMutation({
  args: { eventId: v.string(), event: webhookEventValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const seen = await ctx.db
      .query('stripeEvents')
      .withIndex('by_event_id', (q) => q.eq('eventId', args.eventId))
      .unique();
    if (seen !== null) {
      return null;
    }
    await ctx.db.insert('stripeEvents', {
      eventId: args.eventId,
      type: args.event.type,
      receivedAt: Date.now(),
    });

    const { event } = args;
    const stake = await findStakeForEvent(ctx, {
      stakeId: 'stakeId' in event ? event.stakeId : undefined,
      goalId: 'goalId' in event ? event.goalId : undefined,
      paymentIntentId: event.paymentIntentId,
    });
    if (stake?.kind !== 'money') {
      // Deleted goal, a test-mode `stripe trigger`, or a charge we never made.
      console.warn(`Stripe ${event.type} ${args.eventId} matched no money stake`);
      return null;
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await markCharged(ctx, stake, event.paymentIntentId);
        break;
      case 'payment_intent.payment_failed':
        await markFailed(ctx, stake, event.reason, 'declined', event.paymentIntentId);
        break;
      case 'charge.refunded':
        if (stake.status !== 'charged' && stake.status !== 'refunded') break;
        await ctx.db.patch(
          'stakes',
          stake._id,
          event.fullyRefunded
            ? {
                status: 'refunded',
                refundedCents: event.amountRefundedCents,
                refundedAt: stake.refundedAt ?? Date.now(),
              }
            : { refundedCents: event.amountRefundedCents },
        );
        break;
      case 'charge.dispute.created':
        if (stake.status !== 'charged' && stake.status !== 'refunded') break;
        await ctx.db.patch('stakes', stake._id, {
          status: 'disputed',
          stripeDisputeId: event.disputeId,
          disputedAt: Date.now(),
        });
        break;
    }

    return null;
  },
});

async function findStakeForEvent(
  ctx: MutationCtx,
  refs: { stakeId?: string; goalId?: string; paymentIntentId?: string },
): Promise<Doc<'stakes'> | null> {
  // Metadata is trusted only because the signature was checked; still, an id
  // from another deployment (dev events hitting prod) must not throw.
  const stakeId = refs.stakeId === undefined ? null : ctx.db.normalizeId('stakes', refs.stakeId);
  if (stakeId !== null) {
    const stake = await ctx.db.get('stakes', stakeId);
    if (stake !== null) return stake;
  }

  const goalId = refs.goalId === undefined ? null : ctx.db.normalizeId('goals', refs.goalId);
  if (goalId !== null) {
    const goal = await ctx.db.get('goals', goalId);
    if (goal !== null) {
      const stake = await materializeGoalStake(ctx, goal);
      if (stake !== null) return stake;
    }
  }

  if (refs.paymentIntentId === undefined) return null;
  const paymentIntentId = refs.paymentIntentId;
  const stake = await ctx.db
    .query('stakes')
    .withIndex('by_payment_intent', (q) => q.eq('stripePaymentIntentId', paymentIntentId))
    .first();
  if (stake !== null) return stake;

  const legacy = await ctx.db
    .query('goals')
    .withIndex('by_payment_intent', (q) => q.eq('stake.stripePaymentIntentId', paymentIntentId))
    .first();
  return legacy === null ? null : await materializeGoalStake(ctx, legacy);
}
