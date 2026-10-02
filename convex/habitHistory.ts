import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import { frozenDaysBetween } from './freezes';
import { getCurrentUserOrNull } from './lib/auth';
import { dayOfWeek, daysBefore, nextDay } from './lib/days';
import { DAILY, targetPerWeek } from './lib/frequency';
import { authedQuery } from './lib/customFunctions';
import {
  bestStreak,
  dayHistory,
  HISTORY_WEEKS,
  weekHistory,
  type HistoryDayState,
  type HistoryWeekState,
} from './lib/habitHistory';
import { firstJudgedWeek, weekStartsOn } from './lib/habitWeek';
import { lastCountedDay } from './lib/endDate';
import { localDay } from './lib/lockout';
import { proofMethodValidator } from './lib/proofMethods';

const dayStateValidator = v.union(
  v.literal('done'),
  v.literal('missed'),
  v.literal('excused'),
  v.literal('frozen'),
  v.literal('pending'),
  v.literal('open'),
  v.literal('off'),
);

const weekStateValidator = v.union(
  v.literal('met'),
  v.literal('short'),
  v.literal('frozen'),
  v.literal('open'),
  v.literal('off'),
);

const attemptValidator = v.object({
  status: v.union(
    v.literal('pending'),
    v.literal('approved'),
    v.literal('rejected'),
    v.literal('failed'),
  ),
  reason: v.optional(v.string()),
  method: v.optional(proofMethodValidator),
  at: v.number(),
});

const historyValidator = v.object({
  habitId: v.id('habits'),
  /** Daily habits: the last two weeks, a day at a time. Empty for weekly ones. */
  days: v.array(v.object({ day: v.string(), state: dayStateValidator })),
  /** Weekly habits: the last eight weeks. Empty for daily ones. */
  weeks: v.array(v.object({ weekStart: v.string(), count: v.number(), state: weekStateValidator })),
  /** The newest check, or the newest log when there is no check behind it. */
  lastAttempt: v.union(attemptValidator, v.null()),
});

export type HabitHistory = typeof historyValidator.type;

const activityValidator = v.object({
  /** A check's id, or a log's when no check stands behind it. */
  id: v.string(),
  status: attemptValidator.fields.status,
  reason: v.optional(v.string()),
  method: v.optional(proofMethodValidator),
  day: v.string(),
  at: v.number(),
  /** Photo checks only; `null` once the photo is gone. */
  photoUrl: v.union(v.string(), v.null()),
});

const detailValidator = v.object({
  /** Daily habits: whole weeks, Monday first, from four weeks back to today. */
  days: historyValidator.fields.days,
  /** Weekly habits: the last twelve weeks. */
  weeks: historyValidator.fields.weeks,
  /** Every log, ever. */
  total: v.number(),
  /** The longest streak it ever had, in the habit's own unit. */
  best: v.number(),
  /** Newest first. */
  activity: v.array(activityValidator),
  /** Older activity exists past what's shown. */
  moreActivity: v.boolean(),
});

export type HabitActivity = typeof activityValidator.type;
export type HabitDetailHistory = typeof detailValidator.type;
export type { HistoryDayState, HistoryWeekState };

const MAX_HABITS = 200;
const MAX_ROWS = 5000;

/**
 * Each habit's recent run and its last attempt, for the Commitments tab. Its
 * own query rather than more fields on `habits.list`, which the tab bar and the
 * Me screens also subscribe to. Like `habits.list`, `today` comes from the client.
 */
export const recent = query({
  args: { today: v.string() },
  returns: v.array(historyValidator),
  handler: async (ctx, args): Promise<HabitHistory[]> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return [];

    // Far enough back for the oldest week of any habit, whatever weekday it starts on.
    const from = daysBefore(args.today, HISTORY_WEEKS * 7);

    const habits = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(MAX_HABITS);
    const completions = await ctx.db
      .query('habitCompletions')
      .withIndex('by_user_and_day', (q) => q.eq('userId', user._id).gte('day', from))
      .take(MAX_ROWS);
    const verifications = await ctx.db
      .query('habitVerifications')
      .withIndex('by_user_and_day', (q) => q.eq('userId', user._id).gte('day', from))
      .take(MAX_ROWS);
    const frozen = await frozenDaysBetween(ctx, user._id, from, args.today);

    const done = groupDays(completions);
    // A day's newest check decides whether it was excused or is still pending.
    const latest = new Map<string, Doc<'habitVerifications'>>();
    for (const verification of verifications) {
      const key = `${verification.habitId}|${verification.day}`;
      const seen = latest.get(key);
      if (seen === undefined || verification.createdAt > seen.createdAt) {
        latest.set(key, verification);
      }
    }
    const excused = groupDays([...latest.values()].filter((row) => row.status === 'failed'));
    const pending = groupDays([...latest.values()].filter((row) => row.status === 'pending'));

    return await Promise.all(
      habits.map(async (habit): Promise<HabitHistory> => {
        const input = {
          today: args.today,
          ...countedWindow(user, habit),
          done: done.get(habit._id) ?? new Set<string>(),
          excused: excused.get(habit._id) ?? new Set<string>(),
          pending: pending.get(habit._id) ?? new Set<string>(),
          frozen,
        };
        const target = targetPerWeek(habit);
        const daily = target >= DAILY;

        return {
          habitId: habit._id,
          days: daily ? dayHistory(input) : [],
          weeks: daily ? [] : weekHistory({ ...input, target }),
          lastAttempt: await lastAttempt(habit._id),
        };
      }),
    );

    async function lastAttempt(habitId: Id<'habits'>): Promise<HabitHistory['lastAttempt']> {
      const verification = await ctx.db
        .query('habitVerifications')
        .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId))
        .order('desc')
        .first();
      if (verification !== null) {
        return {
          status: verification.status,
          reason: verification.reason,
          method: verification.method,
          at: verification.resolvedAt ?? verification.createdAt,
        };
      }
      const completion = await ctx.db
        .query('habitCompletions')
        .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId))
        .order('desc')
        .first();
      return completion === null ? null : { status: 'approved', at: completion.completedAt };
    }
  },
});

/**
 * The days that count against `habit`: for a daily habit never the day it was
 * made (or restarted), nor before the user was last let back in; for a weekly
 * one its weeks from `firstJudgedWeek`. None after it ended or broke.
 */
function countedWindow(
  user: Doc<'users'>,
  habit: Doc<'habits'>,
): { firstDay: string; firstWeek: string; startsOn: number; lastDay?: string } {
  const timeZone = user.timeZone ?? 'UTC';
  const started = habit.startDay ?? localDay(habit._creationTime, timeZone);
  let firstDay = nextDay(started);
  if (user.accountableFrom !== undefined && user.accountableFrom > firstDay) {
    firstDay = user.accountableFrom;
  }
  const anchored = { startDay: started };
  const startsOn = weekStartsOn(anchored);
  const firstWeek = firstJudgedWeek(anchored, user.accountableFrom ?? started);
  const ends: string[] = [];
  const counted = lastCountedDay(habit);
  if (counted !== undefined) ends.push(counted);
  if (habit.brokenAt !== undefined) ends.push(localDay(habit.brokenAt, timeZone));
  return { firstDay, firstWeek, startsOn, lastDay: ends.sort()[0] };
}

function groupDays(rows: { habitId: Id<'habits'>; day: string }[]) {
  const byHabit = new Map<Id<'habits'>, Set<string>>();
  for (const row of rows) {
    const days = byHabit.get(row.habitId) ?? new Set<string>();
    days.add(row.day);
    byHabit.set(row.habitId, days);
  }
  return byHabit;
}

const DETAIL_WEEKS = 12;
const ACTIVITY_LIMIT = 30;

/**
 * Everything the habit screen shows beyond the habit itself: a calendar's
 * worth of history, the best streak and every recent attempt, kept or not.
 * Null for a habit that is gone or someone else's.
 */
export const detail = authedQuery({
  args: { habitId: v.id('habits'), today: v.string() },
  returns: v.union(detailValidator, v.null()),
  handler: async (ctx, args): Promise<HabitDetailHistory | null> => {
    const habit = await ctx.db.get('habits', args.habitId);
    if (habit === null || habit.userId !== ctx.user._id) return null;

    const completions = await ctx.db
      .query('habitCompletions')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', habit._id))
      .order('desc')
      .take(MAX_ROWS);
    const windowStart = daysBefore(args.today, (DETAIL_WEEKS + 1) * 7);
    // Back to the first log, so the best streak bridges old freezes and excused days too.
    const oldest = completions.at(-1)?.day ?? windowStart;
    const verifications = await ctx.db
      .query('habitVerifications')
      .withIndex('by_habit_and_day', (q) =>
        q.eq('habitId', habit._id).gte('day', oldest < windowStart ? oldest : windowStart),
      )
      .order('desc')
      .take(MAX_ROWS);

    const done = new Set(completions.map((completion) => completion.day));
    const frozen = await frozenDaysBetween(
      ctx,
      ctx.user._id,
      oldest < windowStart ? oldest : windowStart,
      args.today,
    );
    const input = historyInput(ctx.user, habit, args.today, done, verifications, frozen);
    const target = targetPerWeek(habit);
    const daily = target >= DAILY;
    // Whole calendar weeks, so a daily habit's grid lines up under its Monday-first headings.
    const calendarDays = 4 * 7 + dayOfWeek(args.today) + 1;

    const activity = await recentActivity(ctx, completions, verifications);

    return {
      days: daily ? dayHistory(input, calendarDays) : [],
      weeks: daily ? [] : weekHistory({ ...input, target }, DETAIL_WEEKS),
      total: completions.length,
      best: bestStreak(done, target, input.startsOn, frozen, input.excused),
      activity: activity.slice(0, ACTIVITY_LIMIT),
      moreActivity: activity.length > ACTIVITY_LIMIT,
    };
  },
});

function historyInput(
  user: Doc<'users'>,
  habit: Doc<'habits'>,
  today: string,
  done: Set<string>,
  verifications: Doc<'habitVerifications'>[],
  frozen: Set<string>,
) {
  // A day's newest check decides whether it was excused or is still pending.
  const latest = new Map<string, Doc<'habitVerifications'>>();
  for (const verification of verifications) {
    const seen = latest.get(verification.day);
    if (seen === undefined || verification.createdAt > seen.createdAt) {
      latest.set(verification.day, verification);
    }
  }
  const daysWith = (status: Doc<'habitVerifications'>['status']) =>
    new Set([...latest.values()].filter((row) => row.status === status).map((row) => row.day));

  return {
    today,
    ...countedWindow(user, habit),
    done,
    excused: daysWith('failed'),
    pending: daysWith('pending'),
    frozen,
  };
}

/** Every check, plus any log with no approved check behind it (older ones), newest first. */
async function recentActivity(
  ctx: QueryCtx,
  completions: Doc<'habitCompletions'>[],
  verifications: Doc<'habitVerifications'>[],
): Promise<HabitActivity[]> {
  const checks = verifications.slice(0, ACTIVITY_LIMIT + 1);
  const approvedDays = new Set(
    verifications.filter((row) => row.status === 'approved').map((row) => row.day),
  );
  const fromChecks = await Promise.all(
    checks.map(async (row): Promise<HabitActivity> => ({
      id: row._id,
      status: row.status,
      reason: row.reason,
      method: row.method,
      day: row.day,
      at: row.resolvedAt ?? row.createdAt,
      photoUrl: row.photoId === undefined ? null : await ctx.storage.getUrl(row.photoId),
    })),
  );
  const fromLogs = completions
    .slice(0, ACTIVITY_LIMIT + 1)
    .filter((row) => !approvedDays.has(row.day))
    .map((row): HabitActivity => ({
      id: row._id,
      status: 'approved',
      day: row.day,
      at: row.completedAt,
      photoUrl: null,
    }));
  return [...fromChecks, ...fromLogs].sort((a, b) => b.at - a.at);
}
