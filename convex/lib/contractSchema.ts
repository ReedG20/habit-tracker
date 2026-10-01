import { v } from 'convex/values';

/**
 * A signed contract: the terms a commitment was signed on, in the user's own
 * hand, kept so the Kept and loss screens can hold it back up. Kept out of
 * `schema.ts` so that file only grows by the table registration.
 *
 * One row per signing. Restarting a habit or upping the ante signs again, and
 * the newest row before an outcome is the one that outcome answers to. Rows
 * outlive the habit, the way stakes do.
 */

/** A run of contract text; `strong` runs are the terms the user filled in. */
export const contractRunValidator = v.object({
  text: v.string(),
  strong: v.optional(v.boolean()),
});

/** A finger signature: SVG path data in the pad's own coordinates. */
export const signatureValidator = v.object({
  width: v.number(),
  height: v.number(),
  strokes: v.array(v.string()),
});

export const contractValidator = v.object({
  userId: v.id('users'),
  kind: v.union(v.literal('habit'), v.literal('goal')),
  /** Exactly one of `habitId` and `goalId`. */
  habitId: v.optional(v.id('habits')),
  goalId: v.optional(v.id('goals')),
  /** The short form of what they signed: the promise and what a miss costs. */
  terms: v.array(contractRunValidator),
  signature: signatureValidator,
});
