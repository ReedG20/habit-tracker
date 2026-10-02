import { v } from 'convex/values';

/**
 * A user contesting a money charge from inside the app (`chargeReviews.ts`),
 * so it reaches a person instead of their bank. Kept out of `schema.ts` so
 * that file only grows by the table registration.
 *
 * `open` → `refunded` when the charge is refunded in Stripe (the
 * `charge.refunded` webhook), or `declined` with a response for the user.
 * One row per stake.
 */

export const contestReasonValidator = v.union(
  v.literal('proof_should_count'),
  v.literal('did_it_not_recorded'),
  v.literal('app_problem'),
  v.literal('something_came_up'),
  v.literal('dont_recognize'),
  v.literal('other'),
);

export type ContestReason = typeof contestReasonValidator.type;

/**
 * A real emergency is a judgment call a person makes from what happened, so
 * claiming one takes a note. The other reasons can stand on the record.
 */
export function contestNeedsNote(reason: ContestReason): boolean {
  return reason === 'something_came_up';
}

export const chargeReviewStatusValidator = v.union(
  v.literal('open'),
  v.literal('refunded'),
  v.literal('declined'),
);

export const chargeReviewValidator = v.object({
  userId: v.id('users'),
  stakeId: v.id('stakes'),
  reason: contestReasonValidator,
  note: v.optional(v.string()),
  status: chargeReviewStatusValidator,
  /** What the user is told when it's declined. */
  response: v.optional(v.string()),
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
});

/**
 * Why money stakes are off for a user: a chargeback, or Stripe's early fraud
 * warning on one of their charges. Cleared by hand in the dashboard.
 */
export const moneyBlockValidator = v.object({
  at: v.number(),
  reason: v.union(v.literal('dispute'), v.literal('fraud_warning')),
});
