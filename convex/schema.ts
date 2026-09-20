import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * `armed` → `charging` → `charged` | `charge_failed` when the deadline passes
 * uncompleted; `armed` → `released` when a submission is approved first.
 * `charging` is the settlement action's claim, so a re-run cannot double charge.
 */
export const stakeStatusValidator = v.union(
  v.literal('armed'),
  v.literal('charging'),
  v.literal('charged'),
  v.literal('charge_failed'),
  v.literal('released'),
);

export const stakeValidator = v.object({
  amountCents: v.number(),
  stripeCustomerId: v.string(),
  stripePaymentMethodId: v.string(),
  stripeSetupIntentId: v.string(),
  status: stakeStatusValidator,
  /** The scheduled `stripe.settle` run, so completion can cancel it. */
  settleJobId: v.optional(v.id('_scheduled_functions')),
  stripePaymentIntentId: v.optional(v.string()),
  chargedAt: v.optional(v.number()),
  failureReason: v.optional(v.string()),
});

export const submissionStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('failed'),
);

/**
 * Days are stored as `YYYY-MM-DD` rather than timestamps. The client computes
 * the key from the device clock, so "did I do this today" follows the user's
 * local midnight instead of UTC, and it stays a plain index lookup.
 */
export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    pictureUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    /** Created lazily the first time the user puts money on a goal. */
    stripeCustomerId: v.optional(v.string()),
  })
    .index('by_token', ['tokenIdentifier'])
    .index('by_email', ['email']),

  /** Every habit is once per day for now; frequency is implicit. */
  habits: defineTable({
    userId: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
  }).index('by_user', ['userId']),

  habitCompletions: defineTable({
    userId: v.id('users'),
    habitId: v.id('habits'),
    day: v.string(),
    completedAt: v.number(),
  })
    .index('by_habit_and_day', ['habitId', 'day'])
    .index('by_user_and_day', ['userId', 'day']),

  /**
   * One row per photo submitted as proof. `pending` rows drive the card's
   * "verifying" state; a resolved row is kept as the audit trail for the day.
   * `failed` means we never got a verdict (API error, timeout), as opposed to
   * `rejected`, where the model said no.
   */
  habitVerifications: defineTable({
    userId: v.id('users'),
    habitId: v.id('habits'),
    day: v.string(),
    photoId: v.id('_storage'),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('failed'),
    ),
    reason: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_habit_and_day', ['habitId', 'day'])
    .index('by_user_and_day', ['userId', 'day']),

  /**
   * A goal is a one-off commitment with a hard deadline. It can only be
   * completed through an approved submission; `stake` is present when the user
   * put money on it, in which case missing `dueAt` charges the saved card.
   */
  goals: defineTable({
    userId: v.id('users'),
    title: v.string(),
    /** What proof the user promised to show. The model judges photos against it. */
    description: v.optional(v.string()),
    /** Deadline as a timestamp: goals are due at a specific time, not just a day. */
    dueAt: v.number(),
    completedAt: v.optional(v.number()),
    order: v.number(),
    stake: v.optional(stakeValidator),
  })
    .index('by_user', ['userId'])
    // Replay protection: a SetupIntent may back at most one goal.
    .index('by_setup_intent', ['stake.stripeSetupIntentId']),

  /**
   * One row per proof attempt. Same lifecycle as `habitVerifications`, but a
   * submission carries several photos and an optional note. `photoIds` is
   * bounded (see `MAX_SUBMISSION_PHOTOS`), so it lives on the row.
   */
  goalSubmissions: defineTable({
    userId: v.id('users'),
    goalId: v.id('goals'),
    photoIds: v.array(v.id('_storage')),
    text: v.optional(v.string()),
    status: submissionStatusValidator,
    reason: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index('by_goal', ['goalId']),
});
