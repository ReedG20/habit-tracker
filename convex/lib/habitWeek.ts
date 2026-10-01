import { dayOfWeek, daysBefore, previousDay, weekEnd, weekStart } from './days';

/**
 * A weekly habit's weeks: seven days in a row starting on the weekday it was
 * made, so a habit made on a Thursday runs Thursday to Wednesday. Week one
 * starts the day it is made, and restarting a habit re-anchors it. Shared by
 * the backend and the app so the two always agree on where a week ends.
 */

type AnchoredHabit = { startDay?: string };

/**
 * The weekday (0 for Monday through 6 for Sunday) the habit's weeks start on.
 * A habit made before the user's zone was known has no `startDay`: Monday.
 */
export function weekStartsOn(habit: AnchoredHabit): number {
  return habit.startDay === undefined ? 0 : dayOfWeek(habit.startDay);
}

/** The first day of the habit's week that `day` falls in. */
export function habitWeekStart(habit: AnchoredHabit, day: string): string {
  return weekStart(day, weekStartsOn(habit));
}

/** The last day of the habit's week that `day` falls in: when that week is judged. */
export function habitWeekEnd(habit: AnchoredHabit, day: string): string {
  return weekEnd(day, weekStartsOn(habit));
}

/**
 * The start of the habit's first week that can count against it: its first
 * week whose days are all accountable, except that the day before
 * `accountableFrom` may be in it too. `accountableFrom` is "tomorrow" when a
 * day is made free (signing up, paying to get back in), and for a weekly habit
 * having that free day inside the week only adds room, so week one still counts.
 */
export function firstJudgedWeek(habit: AnchoredHabit, accountableFrom: string): string {
  const freeDay = previousDay(accountableFrom);
  const earliest =
    habit.startDay !== undefined && habit.startDay > freeDay ? habit.startDay : freeDay;
  const start = habitWeekStart(habit, earliest);
  return start === earliest ? start : daysBefore(start, -7);
}
