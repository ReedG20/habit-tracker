import { v } from 'convex/values';

/**
 * What's left of a habit once it is deleted, for the Past list on
 * Commitments. Goals need no such record: a finished or missed goal keeps its
 * own row. Kept out of `schema.ts` so that file only grows by the table
 * registration.
 */

/** How it went: kept to the end of its notice, lost on a miss, or just ended. */
export const endedHabitOutcomeValidator = v.union(
  v.literal('kept'),
  v.literal('lost'),
  v.literal('ended'),
);

export const endedHabitValidator = v.object({
  userId: v.id('users'),
  /** Snapshots: the habit and its logs are gone. */
  title: v.string(),
  icon: v.optional(v.string()),
  outcome: endedHabitOutcomeValidator,
  /** Days it was logged, over its whole life. */
  completions: v.number(),
  /** The habit's own creation time. */
  startedAt: v.number(),
  endedAt: v.number(),
  /** The stake it ended on. Stake rows outlive the habit; a lost one opens the loss screen. */
  stakeId: v.optional(v.id('stakes')),
  /** A kept one opens its Kept screen. */
  accomplishmentId: v.optional(v.id('accomplishments')),
});
