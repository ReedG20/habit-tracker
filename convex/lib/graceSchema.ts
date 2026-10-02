import { v } from 'convex/values';

/**
 * The one-time reprieve on a first miss (`lib/grace.ts`). Kept out of
 * `schema.ts` so that file only grows by the table registrations.
 *
 * Never advertised: the user learns it exists the moment it saves them, from
 * a screen that says plainly it won't happen again.
 */

/** Why they missed, from the chips on the grace screen. */
export const graceReasonValidator = v.union(
  v.literal('forgot'),
  v.literal('proof'),
  v.literal('busy'),
  v.literal('too_much'),
);

/**
 * One row per stake the reprieve covered. A habit check can waive several at
 * once (every staked habit missed that day), so they share `grantedAt` and
 * the screen shows them together.
 */
export const graceValidator = v.object({
  userId: v.id('users'),
  stakeId: v.id('stakes'),
  /** `waived`: a habit's miss had no consequence. `extended`: a goal's deadline moved. */
  kind: v.union(v.literal('waived'), v.literal('extended')),
  habitId: v.optional(v.id('habits')),
  goalId: v.optional(v.id('goals')),
  /** The commitment's title then: the habit may be gone by the time the screen shows. */
  title: v.string(),
  /** Habits: the day missed, or the first day of the week that came up short. */
  missedPeriod: v.optional(v.string()),
  /** Goals: the deadline that passed, and the one it moved to. */
  originalDueAt: v.optional(v.number()),
  extendedTo: v.optional(v.number()),
  grantedAt: v.number(),
  seenAt: v.optional(v.number()),
  reason: v.optional(graceReasonValidator),
});

/**
 * Someone who already had their reprieve, as an HMAC of their email or their
 * card's Stripe fingerprint. Holds no user id, so it outlives account
 * deletion: deleting and signing up again doesn't earn another.
 */
export const graceMarkValidator = v.object({
  hash: v.string(),
  createdAt: v.number(),
});
