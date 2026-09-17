import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type MutationCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { authedMutation } from './lib/customFunctions';
import { habitIconKey, verificationMethod } from './schema';

const habitValidator = v.object({
  _id: v.id('habits'),
  _creationTime: v.number(),
  userId: v.id('users'),
  title: v.string(),
  streak: v.number(),
  frequency: v.string(),
  verification: verificationMethod,
  iconKey: habitIconKey,
  order: v.number(),
});

type AuthedMutationCtx = MutationCtx & { user: Doc<'users'> };

async function requireOwnedHabit(
  ctx: AuthedMutationCtx,
  habitId: Id<'habits'>,
): Promise<Doc<'habits'>> {
  const habit = await ctx.db.get('habits', habitId);
  if (habit === null) {
    throw new Error('Habit not found');
  }

  if (habit.userId !== ctx.user._id) {
    throw new Error('Unauthorized: this habit belongs to another user');
  }

  return habit;
}

/**
 * Deliberately tolerates a missing user row rather than throwing: on first
 * sign-in this subscribes at the same moment `users.storeUser` runs, and the
 * query re-resolves by itself once that mutation lands.
 */
export const list = query({
  args: {},
  returns: v.array(habitValidator),
  handler: async (ctx): Promise<Doc<'habits'>[]> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) {
      return [];
    }

    const habits = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();

    return habits.sort((a, b) => a.order - b.order);
  },
});

export const create = authedMutation({
  args: {
    title: v.string(),
    frequency: v.string(),
    verification: verificationMethod,
    iconKey: habitIconKey,
  },
  returns: v.id('habits'),
  handler: async (ctx, args): Promise<Id<'habits'>> => {
    const existing = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .collect();

    const order = existing.reduce((max, habit) => Math.max(max, habit.order), -1) + 1;

    return await ctx.db.insert('habits', {
      ...args,
      userId: ctx.user._id,
      streak: 0,
      order,
    });
  },
});

export const update = authedMutation({
  args: {
    habitId: v.id('habits'),
    title: v.optional(v.string()),
    frequency: v.optional(v.string()),
    verification: v.optional(verificationMethod),
    iconKey: v.optional(habitIconKey),
    streak: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireOwnedHabit(ctx, args.habitId);

    // `patch` removes fields set to `undefined`, so only send what was provided.
    const fields: Partial<Doc<'habits'>> = {};
    if (args.title !== undefined) fields.title = args.title;
    if (args.frequency !== undefined) fields.frequency = args.frequency;
    if (args.verification !== undefined) fields.verification = args.verification;
    if (args.iconKey !== undefined) fields.iconKey = args.iconKey;
    if (args.streak !== undefined) fields.streak = args.streak;

    if (Object.keys(fields).length > 0) {
      await ctx.db.patch('habits', args.habitId, fields);
    }

    return null;
  },
});

export const remove = authedMutation({
  args: { habitId: v.id('habits') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireOwnedHabit(ctx, args.habitId);
    await ctx.db.delete('habits', args.habitId);

    return null;
  },
});
