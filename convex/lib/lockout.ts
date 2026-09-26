import type { Doc, Id } from '../_generated/dataModel';
import { env, type MutationCtx, type QueryCtx } from '../_generated/server';
import { countThisWeek, dayOfWeek, daysBefore, nextDay, weekEnd, weekStart } from './days';
import { DAILY, targetPerWeek } from './frequency';

/**
 * The lockout rules, kept pure so they can be tested without a database.
 *
 * A daily habit is missed when a local day ends without an approved photo; a
 * weekly one when a Monday-to-Sunday week ends short of `timesPerWeek`. The day
 * a habit is made and the day the user pays to get back in are free, and a
 * weekly habit is first checked on the first full week after that. A day whose
 * last photo check `failed` (our error, not a rejection) is excused.
 */

export type Miss = {
  habitId: Id<'habits'>;
  title: string;
  kind: 'day' | 'week';
  /** The missed day, or the Monday of the week that ended short. */
  period: string;
};

export type CheckedHabit = Pick<
  Doc<'habits'>,
  '_id' | 'title' | 'timesPerWeek' | 'startDay' | 'endsAfter'
>;

/**
 * The user's calendar day at `now` in `timeZone`, as a `YYYY-MM-DD` key. Throws
 * a RangeError for a zone the runtime does not know.
 */
export function localDay(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));

  const part = (type: 'year' | 'month' | 'day') =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
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

/** The first Monday on or after `day`: a weekly habit only counts whole weeks. */
function firstFullWeek(day: string): string {
  return dayOfWeek(day) === 0 ? day : nextDay(weekEnd(day));
}

/**
 * Every habit that was missed in the days `from` through `to`, at most one
 * entry per habit (its earliest). A weekly habit is judged in the check that
 * covers its Sunday, so `completedDays` must reach back to `weekStart(from)`.
 */
export function findMisses({
  habits,
  completedDays,
  excusedDays,
  accountableFrom,
  from,
  to,
}: {
  habits: CheckedHabit[];
  completedDays: Map<Id<'habits'>, Set<string>>;
  excusedDays: Map<Id<'habits'>, Set<string>>;
  accountableFrom: string;
  from: string;
  to: string;
}): Miss[] {
  const misses: Miss[] = [];

  for (const habit of habits) {
    const done = completedDays.get(habit._id) ?? new Set<string>();
    const excused = excusedDays.get(habit._id) ?? new Set<string>();
    const first = firstCountedDay(habit, accountableFrom);
    const counts = (day: string) => habit.endsAfter === undefined || day <= habit.endsAfter;

    const target = targetPerWeek(habit);
    if (target >= DAILY) {
      for (let day = from; day <= to; day = nextDay(day)) {
        if (day < first || !counts(day)) continue;
        if (done.has(day) || excused.has(day)) continue;
        misses.push({ habitId: habit._id, title: habit.title, kind: 'day', period: day });
        break;
      }
      continue;
    }

    const firstWeek = firstFullWeek(first);
    for (let sunday = weekEnd(from); sunday <= to; sunday = daysBefore(sunday, -7)) {
      const monday = weekStart(sunday);
      if (monday < firstWeek || !counts(sunday)) continue;
      // Excused days stand in for the photo the failed check could not confirm.
      const logged = countThisWeek(new Set([...done, ...excused]), sunday);
      if (logged >= target) continue;
      misses.push({ habitId: habit._id, title: habit.title, kind: 'week', period: monday });
      break;
    }
  }

  return misses;
}

/**
 * Whether `habit` is still owed for the period containing `today`: a daily
 * habit not logged today, or a weekly one short of this week's target. A habit
 * made today owes nothing yet, since its first day is free.
 */
export function isOwed(
  habit: CheckedHabit,
  completedDays: Set<string>,
  today: string,
  accountableFrom: string,
): boolean {
  const first = firstCountedDay(habit, accountableFrom);
  if (targetPerWeek(habit) >= DAILY) {
    return today >= first && !completedDays.has(today);
  }
  const monday = weekStart(today);
  return (
    monday >= firstFullWeek(first) && countThisWeek(completedDays, today) < targetPerWeek(habit)
  );
}

/** The last day a habit deleted on `today` still has to be done: today, or this Sunday. */
export function endOfPeriod(habit: CheckedHabit, today: string): string {
  return targetPerWeek(habit) >= DAILY ? today : weekEnd(today);
}

export async function activeLockout(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'lockouts'> | null> {
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
    throw new Error('Ante is locked until the re-entry fee is paid');
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
