import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * These unions are the source of truth for both the backend and the client.
 * The app derives its types from the generated `Doc<'habits'>` rather than
 * keeping a parallel list in `src/`.
 */
export const verificationMethod = v.union(
  v.literal('camera'),
  v.literal('location'),
  v.literal('timer'),
);

/** Maps to a HugeIcons component in `src/constants/habit-icons.ts`. */
export const habitIconKey = v.union(
  v.literal('dumbbell'),
  v.literal('notebook'),
  v.literal('yoga'),
);

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

  habits: defineTable({
    userId: v.id('users'),
    title: v.string(),
    streak: v.number(),
    frequency: v.string(),
    verification: verificationMethod,
    iconKey: habitIconKey,
    order: v.number(),
  }).index('by_user', ['userId']),
});
