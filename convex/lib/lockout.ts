import { ConvexError } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import { env, type MutationCtx, type QueryCtx } from '../_generated/server';
import { countThisWeek, daysBefore, nextDay, weekEnd, weekStart } from './days';
import { lastCountedDay } from './endDate';
import { DAILY, targetPerWeek } from './frequency';
import { firstJudgedWeek, weekStartsOn } from './habitWeek';
import { habitDay } from './zonedTime';

/**
 * The lockout rules, kept pure so they can be tested without a database.
 *
 * A daily habit is missed when a local day (ending at `DAY_ENDS_AT_HOUR`) ends
 * without an approved photo; a weekly one when one of its weeks ends short of
 * `timesPerWeek`. Each weekly habit's weeks start on the weekday it was made
 * (`habitWeek.ts`), and week one counts. The day a daily habit is made and the
 * day the user pays to get back in are free. A day whose last photo check
 * `failed` (our error, not a rejection) is excused.
 */

export type Miss = {
  habitId: Id<'habits'>;
  title: string;
  kind: 'day' | 'week';
  /** The missed day, or the first day of the week that ended short. */
  period: string;
};

export type CheckedHabit = Pick<
  Doc<'habits'>,
  '_id' | 'title' | 'timesPerWeek' | 'startDay' | 'endsAfter' | 'endsOn'
> & { brokenAt?: number };

/**
 * The user's habit day at `now` in `timeZone`, as a `YYYY-MM-DD` key: it ends
 * at `DAY_ENDS_AT_HOUR`, not midnight. Throws a RangeError for a zone the
 * runtime does not know.
 */
export function localDay(now: number, timeZone: string): string {
  return habitDay(now, timeZone);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    localDay(0, timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The first day that can count against `habit`: never the day it was made. */
export function firstCountedDay(habit: CheckedHabit, accountableFrom: string): string {
  if (habit.startDay === undefined) return accountableFrom;
  const afterStart = nextDay(habit.startDay);
  return afterStart > accountableFrom ? afterStart : accountableFrom;
}

/**
 * Every habit that was missed in the days `from` through `to`, at most one
 * entry per habit (its earliest). A weekly habit is judged in the check that
 * covers its week's last day, so `completedDays` must reach back six days
 * before `from`.
 *
 * `frozenDays` (a lockout's freeze) are never judged: a daily habit skips
 * them, and a week that touches one isn't judged at all. A broken habit (its
 * stake already came due) isn't judged until it is restarted.
 */
export function findMisses({
  habits,
  completedDays,
  excusedDays,
  frozenDays = new Set(),
  accountableFrom,
  from,
  to,
}: {
  habits: CheckedHabit[];
  completedDays: Map<Id<'habits'>, Set<string>>;
  excusedDays: Map<Id<'habits'>, Set<string>>;
  frozenDays?: Set<string>;
  accountableFrom: string;
  from: string;
  to: string;
}): Miss[] {
  const misses: Miss[] = [];

  for (const habit of habits) {
    if (habit.brokenAt !== undefined) continue;
    const done = completedDays.get(habit._id) ?? new Set<string>();
    const excused = excusedDays.get(habit._id) ?? new Set<string>();
    const lastDay = lastCountedDay(habit);
    const counts = (day: string) => lastDay === undefined || day <= lastDay;

    const target = targetPerWeek(habit);
    if (target >= DAILY) {
      const first = firstCountedDay(habit, accountableFrom);
      for (let day = from; day <= to; day = nextDay(day)) {
        if (day < first || !counts(day) || frozenDays.has(day)) continue;
        if (done.has(day) || excused.has(day)) continue;
        misses.push({ habitId: habit._id, title: habit.title, kind: 'day', period: day });
        break;
      }
      continue;
    }

    const startsOn = weekStartsOn(habit);
    const firstWeek = firstJudgedWeek(habit, accountableFrom);
    const frozenWeeks = new Set([...frozenDays].map((day) => weekStart(day, startsOn)));
    for (let last = weekEnd(from, startsOn); last <= to; last = daysBefore(last, -7)) {
      const start = weekStart(last, startsOn);
      if (start < firstWeek || !counts(last) || frozenWeeks.has(start)) continue;
      // Excused days stand in for the photo the failed check could not confirm.
      const logged = countThisWeek(new Set([...done, ...excused]), last, startsOn);
      if (logged >= target) continue;
      misses.push({ habitId: habit._id, title: habit.title, kind: 'week', period: start });
      break;
    }
  }

  return misses;
}

/**
 * Whether `habit` is still owed for the period containing `today`: a daily
 * habit not logged today, or a weekly one short of this week's target. A daily
 * habit made today owes nothing yet, since its first day is free; a weekly one
 * owes from the day it is made.
 */
export function isOwed(
  habit: CheckedHabit,
  completedDays: Set<string>,
  today: string,
  accountableFrom: string,
): boolean {
  // Broken: its stake already came due, and it isn't judged until restarted.
  if (habit.brokenAt !== undefined) return false;
  if (targetPerWeek(habit) >= DAILY) {
    return today >= firstCountedDay(habit, accountableFrom) && !completedDays.has(today);
  }
  const startsOn = weekStartsOn(habit);
  return (
    weekStart(today, startsOn) >= firstJudgedWeek(habit, accountableFrom) &&
    countThisWeek(completedDays, today, startsOn) < targetPerWeek(habit)
  );
}

/**
 * Whether habits run on per-habit stakes (`habitChecks.ts`) rather than the
 * re-entry fee. On everywhere once production is cut over.
 */
export function stakesV2Enabled(): boolean {
  return env.STAKES_V2 === 'on';
}

/** The re-entry fee lock, which no longer exists once stakes v2 is on. */
export async function activeLockout(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'lockouts'> | null> {
  if (stakesV2Enabled()) return null;
  return await ctx.db
    .query('lockouts')
    .withIndex('by_user_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
    .first();
}

/**
 * Refuses anything a locked user may not do: logging, creating, editing or
 * deleting habits and goals. Submitting goal proof deliberately skips this, so
 * goals keep running through a lock.
 */
export async function requireUnlocked(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  if ((await activeLockout(ctx, userId)) !== null) {
    throw new ConvexError('Ante is locked until the re-entry fee is paid');
  }
}

/**
 * Developer bypasses (force-delete, lock and unlock on demand). Only honoured
 * where `ANTE_DEV_OVERRIDES=1` is set, which is dev and preview, never production.
 */
export function devOverridesEnabled(): boolean {
  return env.ANTE_DEV_OVERRIDES === '1';
}

export function requireDevOverrides(): void {
  if (!devOverridesEnabled()) {
    throw new Error('Developer overrides are off on this deployment');
  }
}
