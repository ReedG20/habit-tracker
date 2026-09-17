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
