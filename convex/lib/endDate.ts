import { daysBefore } from './days';
import { DAILY, targetPerWeek } from './frequency';
import { habitWeekEnd } from './habitWeek';

/**
 * A habit can be made to run through a set end date instead of until it is
 * ended: it counts through `endsOn`, then finishes on its own, kept if it was
 * kept. For someone who knows something's coming up, so they can commit to
 * the stretch before it and decide afterwards. Shared by the backend and the
 * app so both land on the same last day.
 *
 * The date is fixed once signed (it can only change inside the call-off
 * window), and ending sooner still takes the week's notice (`ending.ts`).
 */

/** The lengths offered as chips, in weeks. */
export const END_DATE_PRESET_WEEKS = [2, 4, 8, 12] as const;

/** At least a week, so an end date is never a quicker way out than the notice. */
export const MIN_END_DATE_WEEKS = 1;

/** At most a year out. */
export const MAX_END_DATE_WEEKS = 52;

type DatedHabit = { timesPerWeek?: number; startDay?: string };

/**
 * The last day that still counts against `habit`: its end date, or the end
 * of its week's notice if it was ended sooner. `undefined` while it runs
 * until ended.
 */
export function lastCountedDay(habit: { endsAfter?: string; endsOn?: string }): string | undefined {
  const { endsAfter, endsOn } = habit;
  if (endsAfter === undefined) return endsOn;
  if (endsOn === undefined) return endsAfter;
  return endsAfter < endsOn ? endsAfter : endsOn;
}

/**
 * The last counted day of a habit made on `startDay` that runs `weeks` weeks.
 * A daily habit's first day is free, so its count starts the day after; a
 * weekly one's week one starts the day it's made.
 */
export function endDayAfterWeeks(habit: DatedHabit & { startDay: string }, weeks: number): string {
  const days = weeks * 7;
  return targetPerWeek(habit) >= DAILY
    ? daysBefore(habit.startDay, -days)
    : daysBefore(habit.startDay, -(days - 1));
}

/**
 * `day` as an end date: a weekly habit is only judged in whole weeks, so its
 * end date moves to the end of the habit's week that `day` falls in.
 */
export function snapEndDay(habit: DatedHabit, day: string): string {
  return targetPerWeek(habit) >= DAILY ? day : habitWeekEnd(habit, day);
}

/**
 * The end date a habit made on `startDay` would keep for the picked `day`, or
 * `null` when it's under a week or more than a year out.
 */
export function validEndDay(habit: DatedHabit & { startDay: string }, day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const snapped = snapEndDay(habit, day);
  if (snapped < endDayAfterWeeks(habit, MIN_END_DATE_WEEKS)) return null;
  if (snapped > endDayAfterWeeks(habit, MAX_END_DATE_WEEKS)) return null;
  return snapped;
}

/**
 * Whether a broken habit with an end date still has a week left to restart
 * into, counting from `today` as its new start. Less than that and it's
 * left to finish; starting another is the way back.
 */
export function restartableBefore(
  habit: DatedHabit & { endsOn?: string },
  today: string,
): boolean {
  if (habit.endsOn === undefined) return true;
  const restarted = { ...habit, startDay: today };
  return snapEndDay(restarted, habit.endsOn) >= endDayAfterWeeks(restarted, MIN_END_DATE_WEEKS);
}

const endDayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Thu, Oct 30", for words the backend writes (the app formats in the user's locale). */
export function endDayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  // `Date.UTC` as a calendar only: formatted in UTC, so the day never shifts.
  return endDayFormat.format(Date.UTC(year, month - 1, date));
}
