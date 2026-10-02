import { v, type Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type MutationCtx, type QueryCtx } from './_generated/server';
import { currentStreak } from './habitStreaks';
import { getCurrentUserOrNull } from './lib/auth';
import { authedMutation } from './lib/customFunctions';
import { DAILY, targetPerWeek } from './lib/frequency';
import { requireDevOverrides } from './lib/lockout';
import { isMilestone, nextMilestone, type MilestoneUnit } from './lib/milestones';
import { stakeView, stakeViewValidator } from './lib/stakeRules';

/**
 * Streak milestones (`lib/milestones.ts`), and the full-screen moment that
 * marks each one once. Recorded the moment a log lands (`lib/proof.ts`), so it
 * works the same for a photo judged after the app was closed.
 */

/** Bounds the clean-up when a habit goes: a few runs' worth of milestones. */
const MAX_PER_HABIT = 200;

function unitOf(habit: Doc<'habits'>): MilestoneUnit {
  return targetPerWeek(habit) >= DAILY ? 'day' : 'week';
}

/**
 * Records the milestone a log on `day` just reached, if it reached one. Once
 * per run: logging the same day again, or a verdict landing twice, adds
 * nothing. Returns the new row's id.
 */
export async function recordMilestone(
  ctx: MutationCtx,
  habit: Doc<'habits'>,
  day: string,
): Promise<Id<'milestones'> | null> {
  const unit = unitOf(habit);
  const count = await currentStreak(ctx, habit, day);
  if (!isMilestone(count, unit)) return null;

  const runStart = habit.startDay ?? '';
  const existing = await ctx.db
    .query('milestones')
    .withIndex('by_habit_and_count', (q) => q.eq('habitId', habit._id).eq('count', count))
    .take(MAX_PER_HABIT);
  if (existing.some((row) => row.runStart === runStart)) return null;

  return await ctx.db.insert('milestones', {
    userId: habit.userId,
    habitId: habit._id,
    title: habit.title,
    count,
    unit,
    runStart,
    reachedAt: Date.now(),
  });
}

/** A habit's milestones go with it. */
export async function deleteMilestones(ctx: MutationCtx, habitId: Id<'habits'>): Promise<void> {
  const rows = await ctx.db
    .query('milestones')
    .withIndex('by_habit_and_count', (q) => q.eq('habitId', habitId))
    .take(MAX_PER_HABIT);
  for (const row of rows) await ctx.db.delete('milestones', row._id);
}

export const milestoneViewValidator = v.object({
  _id: v.id('milestones'),
  habitId: v.id('habits'),
  title: v.string(),
  count: v.number(),
  unit: v.union(v.literal('day'), v.literal('week')),
  /** The next one to aim for, or null past the last. */
  next: v.union(v.number(), v.null()),
  /** What the habit runs on now; `null` for just their word. */
  stake: v.union(stakeViewValidator, v.null()),
  reachedAt: v.number(),
  seen: v.boolean(),
});

export type MilestoneView = Infer<typeof milestoneViewValidator>;

async function viewOf(ctx: QueryCtx, row: Doc<'milestones'>): Promise<MilestoneView> {
  const habit = await ctx.db.get('habits', row.habitId);
  const stake = habit?.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
  return {
    _id: row._id,
    habitId: row.habitId,
    title: row.title,
    count: row.count,
    unit: row.unit,
    next: nextMilestone(row.count, row.unit),
    stake: stake === null ? null : stakeView(stake),
    reachedAt: row.reachedAt,
    seen: row.seenAt !== undefined,
  };
}

/** The newest milestone the user hasn't seen, which the app opens full screen. */
export const unseen = query({
  args: {},
  returns: v.union(milestoneViewValidator, v.null()),
  handler: async (ctx): Promise<MilestoneView | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const row = await ctx.db
      .query('milestones')
      .withIndex('by_user_and_seen_and_reached', (q) =>
        q.eq('userId', user._id).eq('seenAt', undefined),
      )
      .order('desc')
      .first();
    return row === null ? null : await viewOf(ctx, row);
  },
});

/** One milestone by id, for the screen itself. */
export const get = query({
  args: { milestoneId: v.id('milestones') },
  returns: v.union(milestoneViewValidator, v.null()),
  handler: async (ctx, args): Promise<MilestoneView | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const row = await ctx.db.get('milestones', args.milestoneId);
    if (row === null || row.userId !== user._id) return null;
    return await viewOf(ctx, row);
  },
});

/** Answers it, and any older ones still waiting: only the newest is worth a page. */
export const markSeen = authedMutation({
  args: { milestoneId: v.id('milestones') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get('milestones', args.milestoneId);
    if (row === null || row.userId !== ctx.user._id) {
      throw new Error('Milestone not found');
    }
    const now = Date.now();
    const waiting = await ctx.db
      .query('milestones')
      .withIndex('by_user_and_seen_and_reached', (q) =>
        q.eq('userId', ctx.user._id).eq('seenAt', undefined).lte('reachedAt', row.reachedAt),
      )
      .take(MAX_PER_HABIT);
    for (const milestone of waiting) {
      await ctx.db.patch('milestones', milestone._id, { seenAt: now });
    }
    return null;
  },
});

/**
 * A made-up milestone on the user's first habit, for the dev "Preview
 * milestone" row. Starts seen, like the other previews, so it never pops up later.
 */
export const devPreview = authedMutation({
  args: { count: v.number() },
  returns: v.id('milestones'),
  handler: async (ctx, args): Promise<Id<'milestones'>> => {
    requireDevOverrides();
    const habit = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .first();
    if (habit === null) throw new Error('Make a habit first');
    const now = Date.now();
    return await ctx.db.insert('milestones', {
      userId: ctx.user._id,
      habitId: habit._id,
      title: habit.title,
      count: args.count,
      unit: unitOf(habit),
      runStart: 'preview',
      reachedAt: now,
      seenAt: now,
    });
  },
});
