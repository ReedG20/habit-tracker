import { daysBefore, dayOfWeek, nextDay, previousDay, weekEnd, weekStart } from './days';
import { DAILY } from './frequency';

/**
 * A habit's recent run at a glance, for the Commitments cards. Kept pure so it
 * can be tested without a database; it judges days the way `findMisses` does,
 * but only to draw them; nothing here decides what a miss costs.
 *
 * - `done`: logged.
 * - `missed`: a day that counted went by without a log.
 * - `excused`: its last check `failed` (our error), so it didn't count.
 * - `frozen`: a lockout froze every habit that day.
 * - `pending`: a check is still being looked at.
 * - `open`: today, not logged yet.
 * - `off`: the habit wasn't being counted (before it started, after it ended or broke).
 */
export type HistoryDayState = 'done' | 'missed' | 'excused' | 'frozen' | 'pending' | 'open' | 'off';

/** The same for a Monday-to-Sunday week of a weekly habit. */
export type HistoryWeekState = 'met' | 'short' | 'frozen' | 'open' | 'off';

export const HISTORY_DAYS = 14;
export const HISTORY_WEEKS = 8;

export type HistoryInput = {
  today: string;
  /** The first day that counts against the habit. */
  firstDay: string;
  /** The last day that counts, when it ended or broke. */
  lastDay?: string;
  done: Set<string>;
  excused: Set<string>;
  pending: Set<string>;
  frozen: Set<string>;
};

/** The last `count` days, oldest first, ending today. */
export function dayHistory(
  { today, firstDay, lastDay, done, excused, pending, frozen }: HistoryInput,
  count: number = HISTORY_DAYS,
): { day: string; state: HistoryDayState }[] {
  const days: { day: string; state: HistoryDayState }[] = [];
  for (let day = daysBefore(today, count - 1); day <= today; day = nextDay(day)) {
    days.push({ day, state: dayState(day) });
  }
  return days;

  function dayState(day: string): HistoryDayState {
    if (done.has(day)) return 'done';
    if (day < firstDay || (lastDay !== undefined && day > lastDay)) return 'off';
    if (frozen.has(day)) return 'frozen';
    if (pending.has(day)) return 'pending';
    if (day === today) return 'open';
    if (excused.has(day)) return 'excused';
    return 'missed';
  }
}

/** The last `count` weeks, oldest first, ending with this one. */
export function weekHistory(
  { today, firstDay, lastDay, done, excused, frozen, target }: HistoryInput & { target: number },
  count: number = HISTORY_WEEKS,
): {
  weekStart: string;
  count: number;
  state: HistoryWeekState;
}[] {
  // Like `findMisses`, only whole weeks count.
  const firstWeek = dayOfWeek(firstDay) === 0 ? firstDay : nextDay(weekEnd(firstDay));
  const thisWeek = weekStart(today);
  const weeks: { weekStart: string; count: number; state: HistoryWeekState }[] = [];

  for (let back = count - 1; back >= 0; back -= 1) {
    const monday = daysBefore(thisWeek, back * 7);
    const sunday = weekEnd(monday);
    const inWeek = (day: string) => day >= monday && day <= sunday && day <= today;
    const logs = [...done].filter(inWeek).length;
    // Excused days stand in for the log the failed check couldn't confirm.
    const logged = new Set([...done, ...excused].filter(inWeek)).size;

    let state: HistoryWeekState;
    if (logged >= target) state = 'met';
    else if (monday < firstWeek || (lastDay !== undefined && sunday > lastDay)) state = 'off';
    else if ([...frozen].some(inWeek)) state = 'frozen';
    else if (monday === thisWeek) state = 'open';
    else state = 'short';

    weeks.push({ weekStart: monday, count: logs, state });
  }
  return weeks;
}

/**
 * The longest run the habit ever had, in days for a daily habit and in weeks
 * that hit `target` for a weekly one. Frozen days bridge a run, as they do for
 * the current streak: they neither break it nor add to it.
 */
export function bestStreak(done: Set<string>, target: number, frozen: Set<string>): number {
  if (target >= DAILY) {
    let best = 0;
    let run = 0;
    let last: string | undefined;
    for (const day of [...done].sort()) {
      let bridge = last === undefined ? undefined : previousDay(day);
      while (bridge !== undefined && last !== undefined && bridge > last && frozen.has(bridge)) {
        bridge = previousDay(bridge);
      }
      run = last !== undefined && bridge === last ? run + 1 : 1;
      best = Math.max(best, run);
      last = day;
    }
    return best;
  }

  const logsByWeek = new Map<string, number>();
  for (const day of done) {
    const week = weekStart(day);
    logsByWeek.set(week, (logsByWeek.get(week) ?? 0) + 1);
  }
  const frozenWeeks = new Set([...frozen].map((day) => weekStart(day)));
  const metWeeks = [...logsByWeek].filter(([, logs]) => logs >= target).map(([week]) => week);
  let best = 0;
  let run = 0;
  let last: string | undefined;
  for (const week of metWeeks.sort()) {
    let bridge = last === undefined ? undefined : daysBefore(week, 7);
    while (bridge !== undefined && last !== undefined && bridge > last && frozenWeeks.has(bridge)) {
      bridge = daysBefore(bridge, 7);
    }
    run = last !== undefined && bridge === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = week;
  }
  return best;
}
