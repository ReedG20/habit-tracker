import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

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

  projects: defineTable({
    userId: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    dueDay: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    order: v.number(),
  }).index('by_user', ['userId']),
});
