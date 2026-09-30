import { v } from 'convex/values';

/**
 * A commitment seen through: a goal proven, or a staked habit kept up right
 * to the end of its notice. The Kept screen opens once for each, the way the
 * loss screen does for a miss. Kept out of `schema.ts` so that file only grows
 * by the table registration.
 */

/** The run a habit finished on, captured before the habit and its logs are deleted. */
export const keptRunValidator = v.object({
  /** Days for a daily habit, weeks for the rest. */
  unit: v.union(v.literal('day'), v.literal('week')),
  streak: v.number(),
  /** Logs since the stake was armed. */
  completions: v.number(),
  /** The first day this run could count. */
  sinceDay: v.string(),
  /** The notice's last day. */
  lastDay: v.string(),
  /** How often it was due, for the copy: 7 is every day. */
  timesPerWeek: v.number(),
});

export const accomplishmentValidator = v.object({
  userId: v.id('users'),
  kind: v.union(v.literal('habit'), v.literal('goal')),
  /** A snapshot: a habit is gone by the time its Kept screen opens. */
  title: v.string(),
  /** What was on the line; absent for just their word. Stake rows outlive the habit. */
  stakeId: v.optional(v.id('stakes')),
  goalId: v.optional(v.id('goals')),
  /** Habits only. */
  run: v.optional(keptRunValidator),
  /** Goals only: the deadline, to say how early it landed. */
  dueAt: v.optional(v.number()),
  achievedAt: v.number(),
  /** When the Kept screen for it was answered. */
  seenAt: v.optional(v.number()),
});
