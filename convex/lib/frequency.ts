/**
 * How often a habit is due: some number of days in each Monday-to-Sunday week,
 * on any days, with 7 meaning every day. Shared by the backend and the app so
 * the rule and the words for it never drift apart.
 */

export const DAILY = 7;
export const MIN_TIMES_PER_WEEK = 1;

/** Habits made before frequency existed have no value stored: they are daily. */
export function targetPerWeek(habit: { timesPerWeek?: number }): number {
  return habit.timesPerWeek ?? DAILY;
}

export function isValidTimesPerWeek(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TIMES_PER_WEEK && value <= DAILY;
}

/** "Every day", "Once a week", "Twice a week", "3 times a week". */
export function frequencyLabel(timesPerWeek: number): string {
  if (timesPerWeek >= DAILY) return 'Every day';
  if (timesPerWeek === 1) return 'Once a week';
  if (timesPerWeek === 2) return 'Twice a week';
  return `${timesPerWeek} times a week`;
}

/** The compact form for cards: "Daily", "3× a week". */
export function shortFrequency(timesPerWeek: number): string {
  return timesPerWeek >= DAILY ? 'Daily' : `${timesPerWeek}× a week`;
}
