/**
 * `YYYY-MM-DD` arithmetic. Deliberately not `Date`-based: these keys represent
 * the user's local day, so re-parsing them into a timestamp would reintroduce
 * the timezone the key exists to avoid.
 *
 * A day runs from `DAY_ENDS_AT_HOUR` to `DAY_ENDS_AT_HOUR` local time, not
 * midnight to midnight, so a log at 1am before bed still counts for the day
 * the user is finishing. A week is any seven days in a row: each habit's
 * weeks start on the weekday it was made (`habitWeek.ts`).
 */

/**
 * The local hour a day ends: 3am, so late nights count for the day before.
 * Copy names the hour ("by 3 AM"), so grep for "3 AM" and "3am" if it changes.
 */
export const DAY_ENDS_AT_HOUR = 3;

/**
 * How far back `habits.list` first reads completions for a streak; a run that
 * reaches past it reads further back (`habitStreaks.ts`).
 */
export const STREAK_WINDOW_DAYS = 60;

export function previousDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);

  // `Date.UTC` is only used as a calendar, never as a point in time: the same
  // values go in and come back out, so no timezone is ever applied.
  const shifted = new Date(Date.UTC(year, month - 1, date - 1));

  return toDayKey(shifted);
}

export function nextDay(day: string): string {
  return daysBefore(day, -1);
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
 * A run of days or weeks: how long it is, and the oldest day (or first day of
 * the oldest week) it walked through, counting bridged ones. `earliest` is
 * undefined when nothing was walked through at all.
 */
export type StreakRun = { length: number; earliest?: string };

/**
 * Length of the unbroken run of days ending at `today`, or at yesterday when
 * today has not been logged yet — so a streak is not reported as broken until
 * the day it actually lapses.
 *
 * `bridged` days (frozen by a lockout) neither break the run nor add to it.
 */
export function streakLength(
  days: Set<string>,
  today: string,
  bridged: Set<string> = new Set(),
): number {
  return dailyRun(days, today, bridged).length;
}

/** `streakLength`, plus where the run starts, so a caller can tell it reached its data's edge. */
export function dailyRun(
  days: Set<string>,
  today: string,
  bridged: Set<string> = new Set(),
): StreakRun {
  let cursor = days.has(today) || bridged.has(today) ? today : previousDay(today);

  let length = 0;
  let earliest: string | undefined;
  // Bounded, in case every day in reach is bridged.
  for (let steps = 0; steps < 3660; steps += 1) {
    if (days.has(cursor)) length += 1;
    else if (!bridged.has(cursor)) break;
    earliest = cursor;
    cursor = previousDay(cursor);
  }

  return { length, earliest };
}

/** 0 for Monday through 6 for Sunday, on the calendar. */
export function dayOfWeek(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, date)).getUTCDay();

  return (sundayFirst + 6) % 7;
}

/**
 * How far into its week `day` is, from 0 to 6, for weeks that start on the
 * weekday `startsOn` (0 for Monday through 6 for Sunday, as `dayOfWeek`).
 */
function weekIndex(day: string, startsOn: number): number {
  return (dayOfWeek(day) - startsOn + 7) % 7;
}

/** The first day of the week `day` falls in, for weeks starting on `startsOn`. */
export function weekStart(day: string, startsOn: number): string {
  return daysBefore(day, weekIndex(day, startsOn));
}

/** The last day of the week `day` falls in, for weeks starting on `startsOn`. */
export function weekEnd(day: string, startsOn: number): string {
  return daysBefore(weekStart(day, startsOn), -6);
}

/** Days still open this week, counting `day` itself: 7 on its first day, 1 on its last. */
export function daysLeftInWeek(day: string, startsOn: number): number {
  return 7 - weekIndex(day, startsOn);
}

/** How many of `days` fall in the same week as `today`, up to and including it. */
export function countThisWeek(days: Set<string>, today: string, startsOn: number): number {
  const start = weekStart(today, startsOn);
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
 *
 * A week that touches a `bridged` day (frozen by a lockout) is skipped: it
 * neither counts nor breaks the run.
 */
export function weeklyStreak(
  days: Set<string>,
  today: string,
  target: number,
  startsOn: number,
  bridged: Set<string> = new Set(),
): number {
  return weeklyRun(days, today, target, startsOn, bridged).length;
}

/** `weeklyStreak`, plus the first day of the oldest week the run walked through. */
export function weeklyRun(
  days: Set<string>,
  today: string,
  target: number,
  startsOn: number,
  bridged: Set<string> = new Set(),
): StreakRun {
  const logsByWeek = new Map<string, number>();
  for (const day of days) {
    if (day > today) continue;
    const week = weekStart(day, startsOn);
    logsByWeek.set(week, (logsByWeek.get(week) ?? 0) + 1);
  }
  const bridgedWeeks = new Set<string>();
  for (const day of bridged) bridgedWeeks.add(weekStart(day, startsOn));

  const met = (week: string) => (logsByWeek.get(week) ?? 0) >= target;

  const thisWeek = weekStart(today, startsOn);
  let cursor = met(thisWeek) || bridgedWeeks.has(thisWeek) ? thisWeek : daysBefore(thisWeek, 7);

  let length = 0;
  let earliest: string | undefined;
  for (let steps = 0; steps < 520; steps += 1) {
    if (met(cursor)) length += 1;
    else if (!bridgedWeeks.has(cursor)) break;
    earliest = cursor;
    cursor = daysBefore(cursor, 7);
  }

  return { length, earliest };
}

/** Every day from `from` through `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 3660; day = nextDay(day)) days.push(day);
  return days;
}
