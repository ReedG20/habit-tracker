import { DAY, RateLimiter } from '@convex-dev/rate-limiter';
import { ConvexError, v } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, query, type MutationCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { chargeReviewStatusValidator, contestReasonValidator } from './lib/chargeReviewSchema';
import { authedMutation } from './lib/customFunctions';
import { notifyContestDeclined } from './lib/notify';

/**
 * Contesting a charge from inside the app: "my proof should have counted",
 * "I don't recognize this". It reaches a person (`emails.sendSupportCase`)
 * instead of the user's bank, where it would be a chargeback. Support either
 * refunds in Stripe, which the `charge.refunded` webhook turns into a
 * resolved review and a push, or keeps the charge with `decline`.
 */

/** Same as the card networks' dispute window; after it, it's an email to support. */
export const CONTEST_WINDOW_MS = 120 * DAY;
export const MAX_NOTE_LENGTH = 1000;

const contestLimiter = new RateLimiter(components.rateLimiter, {
  contest: { kind: 'token bucket', rate: 5, period: DAY, capacity: 5 },
});

export const reviewViewValidator = v.object({
  status: chargeReviewStatusValidator,
  response: v.optional(v.string()),
  createdAt: v.number(),
});

/** The user's review of one charge, or `null` if they haven't contested it. */
export const forStake = query({
  args: { stakeId: v.id('stakes') },
  returns: v.union(reviewViewValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const review = await ctx.db
      .query('chargeReviews')
      .withIndex('by_stake', (q) => q.eq('stakeId', args.stakeId))
      .unique();
    if (review === null || review.userId !== user._id) return null;
    return { status: review.status, response: review.response, createdAt: review.createdAt };
  },
});

/** Contests a charge. Asking twice returns the first review. */
export const request = authedMutation({
  args: {
    stakeId: v.id('stakes'),
    reason: contestReasonValidator,
    note: v.optional(v.string()),
  },
  returns: reviewViewValidator,
  handler: async (ctx, args) => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake === null || stake.userId !== ctx.user._id || stake.kind !== 'money') {
      throw new ConvexError('That charge wasn’t found');
    }

    const existing = await ctx.db
      .query('chargeReviews')
      .withIndex('by_stake', (q) => q.eq('stakeId', stake._id))
      .unique();
    if (existing !== null) {
      return {
        status: existing.status,
        response: existing.response,
        createdAt: existing.createdAt,
      };
    }

    if (stake.status !== 'charged' || stake.chargedAt === undefined) {
      throw new ConvexError(
        stake.status === 'refunded'
          ? 'This charge was already refunded'
          : 'Only a charge that went through can be contested',
      );
    }
    if (Date.now() - stake.chargedAt > CONTEST_WINDOW_MS) {
      throw new ConvexError(
        'This charge is too old to contest here. Email support@useanteapp.com.',
      );
    }

    const note = args.note?.trim();
    if (note !== undefined && note.length > MAX_NOTE_LENGTH) {
      throw new ConvexError(`Keep it under ${MAX_NOTE_LENGTH} characters`);
    }

    const limit = await contestLimiter.limit(ctx, 'contest', { key: ctx.user._id });
    if (!limit.ok) {
      throw new ConvexError('That’s a lot for one day. Email support@useanteapp.com instead.');
    }

    const createdAt = Date.now();
    const reviewId = await ctx.db.insert('chargeReviews', {
      userId: ctx.user._id,
      stakeId: stake._id,
      reason: args.reason,
      note: note === undefined || note.length === 0 ? undefined : note,
      status: 'open',
      createdAt,
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendSupportCase, {
      stakeId: stake._id,
      kind: 'contest',
      reviewId,
    });
    return { status: 'open' as const, createdAt };
  },
});

/**
 * Support keeps the charge. Run from the dashboard with a short, kind
 * `response`; the user gets it as a push.
 */
export const decline = internalMutation({
  args: { stakeId: v.id('stakes'), response: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const review = await ctx.db
      .query('chargeReviews')
      .withIndex('by_stake', (q) => q.eq('stakeId', args.stakeId))
      .unique();
    if (review === null || review.status !== 'open') {
      throw new Error('No open review for that stake');
    }
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake === null) throw new Error('Stake not found');

    const response = args.response.trim();
    await ctx.db.patch('chargeReviews', review._id, {
      status: 'declined',
      response,
      resolvedAt: Date.now(),
    });
    await notifyContestDeclined(ctx, stake, response);
    return null;
  },
});

/** Closes the stake's open review, if there is one: the charge was refunded. */
export async function resolveRefundedReview(
  ctx: MutationCtx,
  stakeId: Id<'stakes'>,
): Promise<void> {
  const review = await ctx.db
    .query('chargeReviews')
    .withIndex('by_stake', (q) => q.eq('stakeId', stakeId))
    .unique();
  if (review === null || review.status !== 'open') return;
  await ctx.db.patch('chargeReviews', review._id, { status: 'refunded', resolvedAt: Date.now() });
}
