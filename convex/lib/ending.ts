import { daysBefore } from './days';
import { DAILY, targetPerWeek } from './frequency';
import { firstJudgedWeek, habitWeekEnd } from './habitWeek';
import { firstCountedDay, type CheckedHabit } from './lockout';

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
 * today. Weekly habits are only judged in whole weeks, so theirs is the end
 * of the habit's week nearest a week out, which leaves 4 to 10 days.
 */
export function noticeLastDay(
  habit: Pick<CheckedHabit, 'timesPerWeek' | 'startDay'>,
  today: string,
): string {
  const weekOut = daysBefore(today, -(NOTICE_DAYS - 1));
  if (targetPerWeek(habit) >= DAILY) return weekOut;
  return habitWeekEnd(habit, daysBefore(weekOut, 3));
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

  const counting =
    targetPerWeek(habit) >= DAILY
      ? firstCountedDay(habit, accountableFrom) <= today
      : firstJudgedWeek(habit, accountableFrom) <= today;
  if (!counting) return { kind: 'now', reason: 'not-started' };

  // A habit with an end date inside the notice already finishes then.
  const lastDay = noticeLastDay(habit, today);
  return {
    kind: 'notice',
    lastDay: habit.endsOn !== undefined && habit.endsOn < lastDay ? habit.endsOn : lastDay,
  };
}
