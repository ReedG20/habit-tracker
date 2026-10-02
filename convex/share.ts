import { v, type Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { frozenDaysBetween } from './freezes';
import { habitStreak } from './habits';
import { authedQuery } from './lib/customFunctions';
import { DAILY, targetPerWeek } from './lib/frequency';
import { isStakeLive } from './lib/stakeRules';
import { lockoutDaysValidator } from './lib/stakeSchema';

/**
 * What a share card shows about one commitment: enough to brag with, nothing
 * private. A friend stake never names the friend, and no card carries the
 * signature or the card on file.
 */

/** Back this far for a streak: further than `habits.list`, so a 100-day run says 100. */
const MAX_COMPLETIONS = 5000;

const shareStakeValidator = v.union(
  v.object({ kind: v.literal('money'), amountCents: v.number() }),
  v.object({ kind: v.literal('friend') }),
  v.object({ kind: v.literal('lockout'), days: lockoutDaysValidator }),
  v.object({ kind: v.literal('none') }),
);

export type ShareStake = Infer<typeof shareStakeValidator>;

const runValidator = v.object({
  count: v.number(),
  unit: v.union(v.literal('day'), v.literal('week'), v.literal('log')),
});

export const shareSubjectValidator = v.object({
  commitment: v.union(v.literal('habit'), v.literal('goal')),
  title: v.string(),
  /** A key from `lib/commitmentIcons.ts`; absent before icons, and on a kept habit (it's gone). */
  icon: v.optional(v.string()),
  /** Habits: how often it's due. */
  timesPerWeek: v.optional(v.number()),
  /** Goals: the deadline. */
  dueAt: v.optional(v.number()),
  stake: shareStakeValidator,
  /** A habit's current run, when it has one. */
  streak: v.optional(runValidator),
  /** Set when this is something seen through. A habit's carries the run it finished on. */
  kept: v.optional(v.object({ achievedAt: v.number(), run: v.optional(runValidator) })),
});

export type ShareSubject = Infer<typeof shareSubjectValidator>;

function shareStake(stake: Doc<'stakes'> | null, live: boolean): ShareStake {
  if (stake === null || (live && !isStakeLive(stake))) return { kind: 'none' };
  switch (stake.kind) {
    case 'money':
      return { kind: 'money', amountCents: stake.amountCents };
    case 'friend':
      return { kind: 'friend' };
    case 'lockout':
      return { kind: 'lockout', days: stake.days };
  }
}

async function stakeOf(ctx: QueryCtx, stakeId: Id<'stakes'> | undefined) {
  return stakeId === undefined ? null : await ctx.db.get('stakes', stakeId);
}

async function currentRun(
  ctx: QueryCtx,
  habit: Doc<'habits'>,
  today: string,
): Promise<ShareSubject['streak']> {
  const completions = await ctx.db
    .query('habitCompletions')
    .withIndex('by_habit_and_day', (q) => q.eq('habitId', habit._id))
    .order('desc')
    .take(MAX_COMPLETIONS);
  const days = new Set(completions.map((completion) => completion.day));
  const oldest = completions.at(-1)?.day ?? today;
  const frozen = await frozenDaysBetween(ctx, habit.userId, oldest, today);
  const count = habitStreak(habit, days, today, frozen);
  if (count === 0) return undefined;
  return { count, unit: targetPerWeek(habit) >= DAILY ? 'day' : 'week' };
}

/**
 * One of the caller's habits, goals or accomplishments, as a card sees it.
 * Pass exactly one id. Null for one that's gone or someone else's.
 */
export const subject = authedQuery({
  args: {
    habitId: v.optional(v.id('habits')),
    goalId: v.optional(v.id('goals')),
    accomplishmentId: v.optional(v.id('accomplishments')),
    /** The device's day, so the streak follows the same clock as the rest of the app. */
    today: v.string(),
  },
  returns: v.union(shareSubjectValidator, v.null()),
  handler: async (ctx, args): Promise<ShareSubject | null> => {
    if (args.habitId !== undefined) {
      const habit = await ctx.db.get('habits', args.habitId);
      if (habit === null || habit.userId !== ctx.user._id) return null;
      return {
        commitment: 'habit',
        title: habit.title,
        icon: habit.icon,
        timesPerWeek: targetPerWeek(habit),
        stake: shareStake(await stakeOf(ctx, habit.stakeId), true),
        streak: await currentRun(ctx, habit, args.today),
      };
    }

    if (args.goalId !== undefined) {
      const goal = await ctx.db.get('goals', args.goalId);
      if (goal === null || goal.userId !== ctx.user._id) return null;
      return {
        commitment: 'goal',
        title: goal.title,
        icon: goal.icon,
        dueAt: goal.dueAt,
        stake: shareStake(await stakeOf(ctx, goal.stakeId), true),
      };
    }

    if (args.accomplishmentId !== undefined) {
      const row = await ctx.db.get('accomplishments', args.accomplishmentId);
      if (row === null || row.userId !== ctx.user._id) return null;
      const goal = row.goalId === undefined ? null : await ctx.db.get('goals', row.goalId);
      const { run } = row;
      return {
        commitment: row.kind,
        title: row.title,
        icon: goal?.icon,
        timesPerWeek: run?.timesPerWeek,
        dueAt: row.dueAt,
        // What rode on it while it held, though it's been let go since.
        stake: shareStake(await stakeOf(ctx, row.stakeId), false),
        kept: {
          achievedAt: row.achievedAt,
          // A run with nothing in a row still counts its logs, as the Kept screen does.
          run:
            run === undefined
              ? undefined
              : run.streak > 0
                ? { count: run.streak, unit: run.unit }
                : { count: run.completions, unit: 'log' },
        },
      };
    }

    return null;
  },
});
