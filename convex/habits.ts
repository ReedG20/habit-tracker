import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type MutationCtx, type QueryCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { authedMutation, authedQuery } from './lib/customFunctions';
import { daysBefore, streakLength, STREAK_WINDOW_DAYS } from './lib/days';

const habitValidator = v.object({
  _id: v.id('habits'),
  _creationTime: v.number(),
  userId: v.id('users'),
  title: v.string(),
  description: v.optional(v.string()),
  order: v.number(),
});

/**
 * Today's latest verification, only while the habit is still incomplete. That is
 * all the card needs: a `pending` row means "verifying", a `rejected` or
 * `failed` row carries the message to show under the title.
 */
const verificationSummaryValidator = v.object({
  status: v.union(
    v.literal('pending'),
    v.literal('approved'),
    v.literal('rejected'),
    v.literal('failed'),
  ),
  reason: v.optional(v.string()),
});

/** A habit plus the per-day state the list screen renders. */
const habitWithProgressValidator = v.object({
  ...habitValidator.fields,
  completedToday: v.boolean(),
  streak: v.number(),
  verification: v.union(verificationSummaryValidator, v.null()),
});

const completionValidator = v.object({
  _id: v.id('habitCompletions'),
  _creationTime: v.number(),
  userId: v.id('users'),
  habitId: v.id('habits'),
  day: v.string(),
  completedAt: v.number(),
});

export type HabitVerificationSummary = {
  status: Doc<'habitVerifications'>['status'];
  reason?: string;
};

export type HabitWithProgress = Doc<'habits'> & {
  completedToday: boolean;
  streak: number;
  verification: HabitVerificationSummary | null;
};

export type AuthedCtx<T> = T & { user: Doc<'users'> };

async function getOwnedHabitOrNull(
  ctx: AuthedCtx<QueryCtx | MutationCtx>,
  habitId: Id<'habits'>,
): Promise<Doc<'habits'> | null> {
  const habit = await ctx.db.get('habits', habitId);
  if (habit === null || habit.userId !== ctx.user._id) {
    return null;
  }

  return habit;
}

export async function requireOwnedHabit(
  ctx: AuthedCtx<QueryCtx | MutationCtx>,
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
 * `today` comes from the client so the day boundary follows the device clock
 * and the query stays cacheable — reading `Date.now()` here would break both.
 *
 * Deliberately tolerates a missing user row rather than throwing: on first
 * sign-in this subscribes at the same moment `users.storeUser` runs, and the
 * query re-resolves by itself once that mutation lands.
 */
export const list = query({
  args: { today: v.string() },
  returns: v.array(habitWithProgressValidator),
  handler: async (ctx, args): Promise<HabitWithProgress[]> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) {
      return [];
    }

    const habits = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();

    // One bounded read covers every habit's streak and today's checkmarks.
    const windowStart = daysBefore(args.today, STREAK_WINDOW_DAYS);
    const recent = await ctx.db
      .query('habitCompletions')
      .withIndex('by_user_and_day', (q) => q.eq('userId', user._id).gte('day', windowStart))
      .collect();

    const daysByHabit = new Map<Id<'habits'>, Set<string>>();
    for (const completion of recent) {
      const days = daysByHabit.get(completion.habitId) ?? new Set<string>();
      days.add(completion.day);
      daysByHabit.set(completion.habitId, days);
    }

    // Only today's rows matter for the card, and only the newest one per habit.
    const todaysVerifications = await ctx.db
      .query('habitVerifications')
      .withIndex('by_user_and_day', (q) => q.eq('userId', user._id).eq('day', args.today))
      .collect();

    const latestVerificationByHabit = new Map<Id<'habits'>, Doc<'habitVerifications'>>();
    for (const verification of todaysVerifications) {
      const current = latestVerificationByHabit.get(verification.habitId);
      if (current === undefined || verification.createdAt > current.createdAt) {
        latestVerificationByHabit.set(verification.habitId, verification);
      }
    }

    return habits
      .sort((a, b) => a.order - b.order)
      .map((habit) => {
        const days = daysByHabit.get(habit._id) ?? new Set<string>();
        const completedToday = days.has(args.today);
        const latest = latestVerificationByHabit.get(habit._id);

        return {
          ...habit,
          completedToday,
          streak: streakLength(days, args.today),
          verification:
            completedToday || latest === undefined
              ? null
              : { status: latest.status, reason: latest.reason },
        };
      });
  },
});

/** Null rather than a throw: a deleted habit's detail screen is an expected state. */
export const get = authedQuery({
  args: { habitId: v.id('habits') },
  returns: v.union(habitValidator, v.null()),
  handler: async (ctx, args): Promise<Doc<'habits'> | null> => {
    return await getOwnedHabitOrNull(ctx, args.habitId);
  },
});

export const stats = authedQuery({
  args: { habitId: v.id('habits'), today: v.string() },
  returns: v.union(v.object({ total: v.number(), streak: v.number() }), v.null()),
  handler: async (ctx, args): Promise<{ total: number; streak: number } | null> => {
    const habit = await getOwnedHabitOrNull(ctx, args.habitId);
    if (habit === null) {
      return null;
    }

    const completions = await ctx.db
      .query('habitCompletions')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', args.habitId))
      .collect();

    const days = new Set(completions.map((completion) => completion.day));

    return { total: completions.length, streak: streakLength(days, args.today) };
  },
});

export const listCompletions = authedQuery({
  args: { habitId: v.id('habits'), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(completionValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal('SplitRecommended'), v.literal('SplitRequired'), v.null())),
  }),
  handler: async (ctx, args) => {
    const habit = await getOwnedHabitOrNull(ctx, args.habitId);
    if (habit === null) {
      return { page: [], isDone: true, continueCursor: '' };
    }

    return await ctx.db
      .query('habitCompletions')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', args.habitId))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const create = authedMutation({
  args: { title: v.string(), description: v.optional(v.string()) },
  returns: v.id('habits'),
  handler: async (ctx, args): Promise<Id<'habits'>> => {
    const existing = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .collect();

    const order = existing.reduce((max, habit) => Math.max(max, habit.order), -1) + 1;

    return await ctx.db.insert('habits', {
      userId: ctx.user._id,
      title: args.title,
      description: args.description,
      order,
    });
  },
});

export const update = authedMutation({
  args: {
    habitId: v.id('habits'),
    title: v.optional(v.string()),
    // `null` clears the description; omitting it leaves the stored value alone.
    description: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireOwnedHabit(ctx, args.habitId);

    // `patch` removes fields set to `undefined`, so only send what was provided.
    const fields: Partial<Doc<'habits'>> = {};
    if (args.title !== undefined) fields.title = args.title;
    if (args.description !== undefined) {
      fields.description = args.description ?? undefined;
    }

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

    const completions = await ctx.db
      .query('habitCompletions')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', args.habitId))
      .collect();

    for (const completion of completions) {
      await ctx.db.delete('habitCompletions', completion._id);
    }

    const verifications = await ctx.db
      .query('habitVerifications')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', args.habitId))
      .collect();

    for (const verification of verifications) {
      await ctx.storage.delete(verification.photoId);
      await ctx.db.delete('habitVerifications', verification._id);
    }

    await ctx.db.delete('habits', args.habitId);

    return null;
  },
});

/**
 * Total completions across every habit. Used on Me; a full-table count is
 * fine while the product is still personal-scale.
 */
export const loggedCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) {
      return 0;
    }

    const completions = await ctx.db
      .query('habitCompletions')
      .withIndex('by_user_and_day', (q) => q.eq('userId', user._id))
      .collect();

    return completions.length;
  },
});
