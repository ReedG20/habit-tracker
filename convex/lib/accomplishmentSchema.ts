import { v } from 'convex/values';

import { proofMethodValidator } from './proofMethods';

/**
 * A commitment seen through: a goal proven, or a staked habit kept up right
 * to the end of its notice or its end date. The Kept screen opens once for each, the way the
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
  /** The last day that counted: its notice's, or its end date. */
  lastDay: v.string(),
  /** How often it was due, for the copy: 7 is every day. */
  timesPerWeek: v.number(),
});

/**
 * How a finished habit was set up, so "Go again" can start a new one on the
 * same terms: the habit row is deleted the night it finishes.
 */
export const keptTermsValidator = v.object({
  description: v.optional(v.string()),
  timesPerWeek: v.number(),
  proofMethod: v.optional(proofMethodValidator),
  timerMinutes: v.optional(v.number()),
  /** Days from its first day through its end date; absent when it had none. */
  lengthDays: v.optional(v.number()),
  icon: v.optional(v.string()),
  iconChosen: v.optional(v.boolean()),
});

export const accomplishmentValidator = v.object({
  userId: v.id('users'),
  kind: v.union(v.literal('habit'), v.literal('goal')),
  /** A snapshot: a habit is gone by the time its Kept screen opens. */
  title: v.string(),
  /** What was on the line; absent for just their word. Stake rows outlive the habit. */
  stakeId: v.optional(v.id('stakes')),
  goalId: v.optional(v.id('goals')),
  /**
   * Habits only, and only on ones kept since end dates: a habit on just
   * their word has no stake to say which habit it was.
   */
  habitId: v.optional(v.id('habits')),
  /** Habits only. */
  run: v.optional(keptRunValidator),
  /** Habits only, and only on ones kept since "Go again". */
  terms: v.optional(keptTermsValidator),
  /** Goals only: the deadline, to say how early it landed. */
  dueAt: v.optional(v.number()),
  achievedAt: v.number(),
  /** When the Kept screen for it was answered. */
  seenAt: v.optional(v.number()),
});
