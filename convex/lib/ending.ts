import { daysBefore, weekEnd } from './days';
import { DAILY, targetPerWeek } from './frequency';
import { firstCountedDay, firstFullWeek, type CheckedHabit } from './lockout';

/**
 * Ending a habit with something live on the line takes a week's notice: it
 * keeps counting, stakes and all, through the last day, and the nightly check
 * removes it after that day has been judged. A day's notice would let a quit
 * on a bad night dodge the miss; a week asks whether it's the long-term call.
 */
export const NOTICE_DAYS = 7;

export type EndingPlan =
  | {
      kind: 'now';
      /** Nothing live is on it (just their word, a spent stake), or nothing has counted yet. */
      reason: 'nothing-on-the-line' | 'not-started';
    }
  | { kind: 'notice'; lastDay: string };

/**
 * The last day a habit ended on `today` still counts: a week out, counting
 * today. Weekly habits are only judged in whole weeks, so theirs is the
 * Sunday nearest a week out, which leaves 4 to 10 days.
 */
export function noticeLastDay(habit: Pick<CheckedHabit, 'timesPerWeek'>, today: string): string {
  const weekOut = daysBefore(today, -(NOTICE_DAYS - 1));
  if (targetPerWeek(habit) >= DAILY) return weekOut;
  return weekEnd(daysBefore(weekOut, 3));
}

/**
 * What ending `habit` on `today` does. `stakeLive` is whether a miss would
 * still cost something. A habit that hasn't started counting has never been
 * owed, so letting it go right away dodges nothing.
 */
export function endingPlan({
  habit,
  stakeLive,
  today,
  accountableFrom,
}: {
  habit: CheckedHabit;
  stakeLive: boolean;
  today: string;
  accountableFrom: string;
}): EndingPlan {
  if (!stakeLive || habit.brokenAt !== undefined) {
    return { kind: 'now', reason: 'nothing-on-the-line' };
  }

  const first = firstCountedDay(habit, accountableFrom);
  const counting = targetPerWeek(habit) >= DAILY ? first <= today : firstFullWeek(first) <= today;
  if (!counting) return { kind: 'now', reason: 'not-started' };

  return { kind: 'notice', lastDay: noticeLastDay(habit, today) };
}
