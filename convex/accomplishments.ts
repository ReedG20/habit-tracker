import { v, type Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type MutationCtx, type QueryCtx } from './_generated/server';
import { finishedStreak } from './habitStreaks';
import { getCurrentUserOrNull } from './lib/auth';
import { keptRunValidator } from './lib/accomplishmentSchema';
import { authedMutation } from './lib/customFunctions';
import { daysBefore } from './lib/days';
import { DAILY, targetPerWeek } from './lib/frequency';
import { localDay, requireDevOverrides } from './lib/lockout';
import { stakeView, stakeViewValidator } from './lib/stakeRules';

/**
 * Commitments seen through, and the Kept screen that marks each one: the
 * counterpart to the loss screen. A goal counts once its proof is approved; a
 * habit once it made it to the end of its notice without a miss.
 */

/** Longest a finished habit's run is read back: a few years of days. */
const MAX_RUN_DAYS = 2000;

type KeptRun = Infer<typeof keptRunValidator>;

/**
 * Records a staked habit that just finished its notice clean. Call it before
 * `deleteHabit`, which takes the logs this reads, and hand that the row. The
 * run counts from when its stake was armed, the way the loss screen's does.
 */
export async function recordKeptHabit(
  ctx: MutationCtx,
  habit: Doc<'habits'>,
  timeZone: string,
  now: number,
): Promise<Id<'accomplishments'> | undefined> {
  const lastDay = habit.endsAfter;
  if (lastDay === undefined || habit.brokenAt !== undefined) return undefined;

  const stake = habit.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
  const sinceDay =
    stake !== null ? localDay(stake.createdAt, timeZone) : (habit.startDay ?? lastDay);
  const rows = await ctx.db
    .query('habitCompletions')
    .withIndex('by_habit_and_day', (q) =>
      q.eq('habitId', habit._id).gte('day', sinceDay).lte('day', lastDay),
    )
    .take(MAX_RUN_DAYS);
  const done = new Set(rows.map((row) => row.day));

  const target = targetPerWeek(habit);
  const daily = target >= DAILY;
  const run: KeptRun = {
    unit: daily ? 'day' : 'week',
    streak: await finishedStreak(ctx, habit, sinceDay, lastDay, done),
    completions: rows.length,
    sinceDay,
    lastDay,
    timesPerWeek: target,
  };

  return await ctx.db.insert('accomplishments', {
    userId: habit.userId,
    kind: 'habit',
    title: habit.title,
    stakeId: stake?._id,
    run,
    achievedAt: now,
  });
}

/** Records a goal whose proof was just approved (`goals.completeGoal`). */
export async function recordKeptGoal(
  ctx: MutationCtx,
  goal: Doc<'goals'>,
  stakeId: Id<'stakes'> | undefined,
  now: number,
): Promise<void> {
  await ctx.db.insert('accomplishments', {
    userId: goal.userId,
    kind: 'goal',
    title: goal.title,
    stakeId,
    goalId: goal._id,
    dueAt: goal.dueAt,
    achievedAt: now,
  });
}

/** Everything the Kept screen shows about one accomplishment. */
export const keptValidator = v.object({
  _id: v.id('accomplishments'),
  kind: v.union(v.literal('habit'), v.literal('goal')),
  title: v.string(),
  /** What was on the line while it held; `null` for just their word. */
  stake: v.union(stakeViewValidator, v.null()),
  run: v.optional(keptRunValidator),
  dueAt: v.optional(v.number()),
  achievedAt: v.number(),
  seen: v.boolean(),
});

export type Kept = Infer<typeof keptValidator>;

async function keptOf(ctx: QueryCtx, row: Doc<'accomplishments'>): Promise<Kept> {
  const stake = row.stakeId === undefined ? null : await ctx.db.get('stakes', row.stakeId);
  return {
    _id: row._id,
    kind: row.kind,
    title: row.title,
    stake: stake === null ? null : stakeView(stake),
    run: row.run,
    dueAt: row.dueAt,
    achievedAt: row.achievedAt,
    seen: row.seenAt !== undefined,
  };
}

/**
 * The newest accomplishment the user hasn't seen, which the app opens full
 * screen. Tolerates a missing user row, like `stakes.unseenLoss`.
 */
export const unseen = query({
  args: {},
  returns: v.union(keptValidator, v.null()),
  handler: async (ctx): Promise<Kept | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;

    const row = await ctx.db
      .query('accomplishments')
      .withIndex('by_user_and_seen_and_achieved', (q) =>
        q.eq('userId', user._id).eq('seenAt', undefined),
      )
      .order('desc')
      .first();
    return row === null ? null : await keptOf(ctx, row);
  },
});

/** One accomplishment by id, for the screen itself. */
export const get = query({
  args: { accomplishmentId: v.id('accomplishments') },
  returns: v.union(keptValidator, v.null()),
  handler: async (ctx, args): Promise<Kept | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const row = await ctx.db.get('accomplishments', args.accomplishmentId);
    if (row === null || row.userId !== user._id) return null;
    return await keptOf(ctx, row);
  },
});

export const markSeen = authedMutation({
  args: { accomplishmentId: v.id('accomplishments') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get('accomplishments', args.accomplishmentId);
    if (row === null || row.userId !== ctx.user._id) {
      throw new Error('Accomplishment not found');
    }
    if (row.seenAt === undefined) {
      await ctx.db.patch('accomplishments', row._id, { seenAt: Date.now() });
    }
    return null;
  },
});

/**
 * A made-up accomplishment for the dev "Preview kept" row: nothing real
 * changes. Uses the user's first staked habit's stake or goal for the stakes line.
 */
export const devPreview = authedMutation({
  args: {
    subject: v.union(v.literal('habit'), v.literal('goal')),
    weekly: v.optional(v.boolean()),
  },
  returns: v.id('accomplishments'),
  handler: async (ctx, args): Promise<Id<'accomplishments'>> => {
    requireDevOverrides();
    const now = Date.now();
    const today = localDay(now, ctx.user.timeZone ?? 'UTC');
    const stake = await ctx.db
      .query('stakes')
      .withIndex('by_user_and_status', (q) => q.eq('userId', ctx.user._id))
      .first();

    if (args.subject === 'goal') {
      return await ctx.db.insert('accomplishments', {
        userId: ctx.user._id,
        kind: 'goal',
        title: 'Run a half marathon',
        stakeId: stake?._id,
        dueAt: now + 3 * 24 * 60 * 60 * 1000,
        achievedAt: now,
      });
    }

    const weekly = args.weekly === true;
    return await ctx.db.insert('accomplishments', {
      userId: ctx.user._id,
      kind: 'habit',
      title: weekly ? 'Go to the gym' : 'Meditate for ten minutes',
      stakeId: stake?._id,
      run: {
        unit: weekly ? 'week' : 'day',
        streak: weekly ? 6 : 34,
        completions: weekly ? 18 : 34,
        sinceDay: daysBefore(today, weekly ? 42 : 34),
        lastDay: daysBefore(today, 1),
        timesPerWeek: weekly ? 3 : DAILY,
      },
      achievedAt: now,
    });
  },
});
