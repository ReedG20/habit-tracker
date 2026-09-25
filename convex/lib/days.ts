/**
 * `YYYY-MM-DD` arithmetic. Deliberately not `Date`-based: these keys represent
 * the user's local calendar day, so re-parsing them into a timestamp would
 * reintroduce the timezone the key exists to avoid.
 */

/** How far back `habits.list` reads completions to compute a streak. */
export const STREAK_WINDOW_DAYS = 60;

export function previousDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);

  // `Date.UTC` is only used as a calendar, never as a point in time: the same
  // values go in and come back out, so no timezone is ever applied.
  const shifted = new Date(Date.UTC(year, month - 1, date - 1));

  return toDayKey(shifted);
}

export function daysBefore(day: string, count: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date - count));

  return toDayKey(shifted);
}

function toDayKey(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Length of the unbroken run of days ending at `today`, or at yesterday when
 * today has not been logged yet — so a streak is not reported as broken until
 * the day it actually lapses.
 */
export function streakLength(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : previousDay(today);

  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }

  return streak;
}

/** 0 for Monday through 6 for Sunday: weeks run Monday to Sunday. */
export function dayOfWeek(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, date)).getUTCDay();

  return (sundayFirst + 6) % 7;
}

/** The Monday that starts the week `day` falls in. */
export function weekStart(day: string): string {
  return daysBefore(day, dayOfWeek(day));
}

/** Days still open this week, counting `day` itself: 7 on a Monday, 1 on a Sunday. */
export function daysLeftInWeek(day: string): number {
  return 7 - dayOfWeek(day);
}

/** How many of `days` fall in the same week as `today`, up to and including it. */
export function countThisWeek(days: Set<string>, today: string): number {
  const start = weekStart(today);
  let count = 0;
  for (const day of days) {
    if (day >= start && day <= today) count += 1;
  }

  return count;
}

/**
 * Unbroken run of weeks that each hit `target` logs, ending with the current
 * week once it has hit it, or with last week while it is still in progress —
 * so, like `streakLength`, a streak only breaks once the week actually ends short.
 */
export function weeklyStreak(days: Set<string>, today: string, target: number): number {
  const logsByWeek = new Map<string, number>();
  for (const day of days) {
    if (day > today) continue;
    const week = weekStart(day);
    logsByWeek.set(week, (logsByWeek.get(week) ?? 0) + 1);
  }

  const met = (week: string) => (logsByWeek.get(week) ?? 0) >= target;

  const thisWeek = weekStart(today);
  let cursor = met(thisWeek) ? thisWeek : daysBefore(thisWeek, 7);

  let streak = 0;
  while (met(cursor)) {
    streak += 1;
    cursor = daysBefore(cursor, 7);
  }

  return streak;
}
