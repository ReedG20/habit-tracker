import { v } from 'convex/values';

/**
 * A streak milestone reached (`lib/milestones.ts`): 7 days in a row, 12
 * weeks… The app opens a full-screen moment once for each, the way it does
 * for a Kept one. Kept out of `schema.ts` so that file only grows by the
 * table registration.
 */

export const milestoneValidator = v.object({
  userId: v.id('users'),
  habitId: v.id('habits'),
  /** A snapshot, for the screen and the push. */
  title: v.string(),
  count: v.number(),
  unit: v.union(v.literal('day'), v.literal('week')),
  /**
   * The day the run it belongs to could start counting (the habit's
   * `startDay`): a restart starts a new run, which can reach the same count again.
   */
  runStart: v.string(),
  reachedAt: v.number(),
  /** When the moment was answered. */
  seenAt: v.optional(v.number()),
});
