import { v, type Infer } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { revisableStake, revisableStakeValidator } from './callOff';
import { finishedStreak } from './habitStreaks';
import { getCurrentUserOrNull } from './lib/auth';
import { keptRunValidator, type keptTermsValidator } from './lib/accomplishmentSchema';
import { authedMutation, authedQuery } from './lib/customFunctions';
import { daysBefore, daysBetween } from './lib/days';
import { DAILY, targetPerWeek } from './lib/frequency';
import { lastCountedDay } from './lib/endDate';
import { localDay, requireDevOverrides } from './lib/lockout';
import { deliver, eventPush } from './lib/notify';
import { proofMethodValidator } from './lib/proofMethods';
import { eventCopy } from './lib/reminderCopy';
import { stakeView, stakeViewValidator } from './lib/stakeRules';
import { zonedDay, zonedInstant } from './lib/zonedTime';

/**
 * Commitments seen through, and the Kept screen that marks each one: the
 * counterpart to the loss screen. A goal counts once its proof is approved; a
 * habit once it made it to the end of its notice without a miss.
 */

/** Longest a finished habit's run is read back: a few years of days. */
const MAX_RUN_DAYS = 2000;

type KeptRun = Infer<typeof keptRunValidator>;
type KeptTerms = Infer<typeof keptTermsValidator>;

/** How the habit was set up, for "Go again" once it's gone. */
function termsOf(habit: Doc<'habits'>): KeptTerms {
  const lengthDays =
    habit.endsOn === undefined || habit.startDay === undefined
      ? undefined
      : daysBetween(habit.startDay, habit.endsOn).length;
  return {
    description: habit.description,
    timesPerWeek: targetPerWeek(habit),
    proofMethod: habit.proofMethod,
    timerMinutes: habit.timerMinutes,
    lengthDays: lengthDays === 0 ? undefined : lengthDays,
    icon: habit.icon,
    iconChosen: habit.iconChosen,
  };
}

/**
 * Records a staked habit that just finished clean: its notice, or its end date. Call it before
 * `deleteHabit`, which takes the logs this reads, and hand that the row. The
 * run counts from when its stake was armed, the way the loss screen's does.
 */
export async function recordKeptHabit(
  ctx: MutationCtx,
  habit: Doc<'habits'>,
  timeZone: string,
  now: number,
): Promise<Id<'accomplishments'> | undefined> {
  const lastDay = lastCountedDay(habit);
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

  const accomplishmentId = await ctx.db.insert('accomplishments', {
    userId: habit.userId,
    kind: 'habit',
    title: habit.title,
    stakeId: stake?._id,
    habitId: habit._id,
    run,
    terms: termsOf(habit),
    achievedAt: now,
  });
  await scheduleKeptNotice(ctx, accomplishmentId, timeZone, now);
  return accomplishmentId;
}

/** Mornings only: a habit finishes in the nightly check, hours before anyone is up. */
const KEPT_NOTICE_TIME = { hour: 9, minute: 0 };
const HOUR_MS = 60 * 60 * 1000;

async function scheduleKeptNotice(
  ctx: MutationCtx,
  accomplishmentId: Id<'accomplishments'>,
  timeZone: string,
  now: number,
): Promise<void> {
  const morning = zonedInstant(
    zonedDay(now, timeZone),
    KEPT_NOTICE_TIME.hour,
    KEPT_NOTICE_TIME.minute,
    timeZone,
  );
  await ctx.scheduler.runAt(Math.max(now, morning), internal.accomplishments.keptNotice, {
    accomplishmentId,
  });
}

/**
 * Tells them a habit finished clean, the morning after: otherwise they'd only
 * find out the next time they happened to open the app. Skipped once the Kept
 * screen has already been seen.
 */
export const keptNotice = internalMutation({
  args: { accomplishmentId: v.id('accomplishments') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get('accomplishments', args.accomplishmentId);
    if (row === null || row.seenAt !== undefined || row.kind !== 'habit') return null;
    const message = {
      kind: 'kept',
      title: row.title,
      streak: row.run?.streak,
      unit: row.run?.unit,
    } as const;
    await deliver(ctx, row.userId, [
      eventPush(eventCopy(message), {
        data: { kind: 'moment', url: `/kept/${row._id}` },
        collapseId: `kept:${row._id}`,
        threadId: 'moment',
        quiet: false,
        expiresAt: Date.now() + 24 * HOUR_MS,
      }),
    ]);
    return null;
  },
});

/** Records a goal whose proof was just approved (`goals.completeGoal`). */
export async function recordKeptGoal(
  ctx: MutationCtx,
  goal: Doc<'goals'>,
  stakeId: Id<'stakes'> | undefined,
  now: number,
): Promise<Id<'accomplishments'>> {
  return await ctx.db.insert('accomplishments', {
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

const goAgainValidator = v.object({
  kind: v.union(v.literal('habit'), v.literal('goal')),
  title: v.string(),
  description: v.optional(v.string()),
  /** Habits only, and only on ones kept since "Go again". */
  timesPerWeek: v.optional(v.number()),
  proofMethod: v.optional(proofMethodValidator),
  timerMinutes: v.optional(v.number()),
  /** Habits: days from the first through the end date, when it had one. */
  lengthDays: v.optional(v.number()),
  /** Goals: how long it had, from signing to its deadline as signed. */
  lengthMs: v.optional(v.number()),
  icon: v.optional(v.string()),
  iconChosen: v.optional(v.boolean()),
  /** What it ran on, to run on again; `null` for just their word, or a friend who opted out. */
  stake: v.union(revisableStakeValidator, v.null()),
  /**
   * Whether every term came back, so it can go straight to signing. Older
   * habits kept before terms were saved only bring back their name.
   */
  complete: v.boolean(),
});

export type GoAgain = Infer<typeof goAgainValidator>;

/**
 * The terms an accomplishment was kept on, for the New flow's "Go again": the
 * same words, the same stake on the same card, and a fresh deadline of the
 * same length. Nothing is created here; it's signed again like any other.
 */
export const again = authedQuery({
  args: { accomplishmentId: v.id('accomplishments') },
  returns: v.union(goAgainValidator, v.null()),
  handler: async (ctx, args): Promise<GoAgain | null> => {
    const row = await ctx.db.get('accomplishments', args.accomplishmentId);
    if (row === null || row.userId !== ctx.user._id) return null;

    const stakeRow = row.stakeId === undefined ? null : await ctx.db.get('stakes', row.stakeId);
    const stake =
      stakeRow === null || (stakeRow.kind === 'friend' && stakeRow.status === 'void')
        ? null
        : revisableStake(stakeRow);
    const common = { kind: row.kind, title: row.title, stake, complete: false };

    if (row.kind === 'goal') {
      const goal = row.goalId === undefined ? null : await ctx.db.get('goals', row.goalId);
      if (goal === null) return common;
      return {
        ...common,
        complete: hasWords(goal.description),
        description: goal.description,
        lengthMs: Math.round((goal.originalDueAt ?? goal.dueAt) - goal._creationTime),
        icon: goal.icon,
        iconChosen: goal.iconChosen,
      };
    }

    const { terms } = row;
    if (terms === undefined) {
      return { ...common, timesPerWeek: row.run?.timesPerWeek };
    }
    // A timer's description is optional; every other way of proving needs one.
    const complete = terms.proofMethod === 'timer' || hasWords(terms.description);
    return { ...common, ...terms, complete };
  },
});

function hasWords(text: string | undefined): boolean {
  return text !== undefined && text.trim().length > 0;
}

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
      terms: {
        description: weekly
          ? 'In the gym, a machine or the weights in view'
          : 'Ten minutes with the phone face down',
        timesPerWeek: weekly ? 3 : DAILY,
        proofMethod: weekly ? 'photo' : 'timer',
        timerMinutes: weekly ? undefined : 10,
      },
      achievedAt: now,
    });
  },
});
