import { daysBetween } from '@/convex/lib/days';
import { targetPerWeek } from '@/convex/lib/frequency';
import { habitWeekEnd } from '@/convex/lib/habitWeek';
import { lastCountedDay } from '@/convex/lib/endDate';
import type { StakeView } from '@/convex/lib/stakeRules';
import { isDaily, type HabitWithProgress } from '@/data/habits';
import { skipConsequence, stakeCost } from '@/data/stakes';
import { fromDayKey } from '@/lib/dates';
import { formatCents } from '@/lib/money';

/**
 * A habit ended with something on the line keeps counting through its last
 * day (`convex/lib/ending.ts`). This is how that notice reads on the card,
 * the detail banner and the end sheet, so they never disagree. A habit with
 * an end date (`convex/lib/endDate.ts`) reads the same way in its last week.
 */

type EndingHabit = Pick<
  HabitWithProgress,
  'endsAfter' | 'endsOn' | 'timesPerWeek' | 'startDay' | 'completedToday' | 'weekCount'
>;

/** How close an end date has to be before the card and the detail say so. */
const END_DATE_SHOWN_DAYS = 7;

export type EndingStatus = {
  lastDay: string;
  /** It's running out its end date, not a notice the user gave: there's nothing to take back. */
  byEndDate: boolean;
  /** Days that still count, today included: 1 on the last day, 0 once it has passed. */
  daysLeft: number;
  /** Nothing is left to log: it only waits for the nightly check to wrap it up. */
  finished: boolean;
  /** For the card: "Ending · 5 days left", "Finishes · last day", "Wraps up tonight". */
  label: string;
};

const lastDayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

/** "Tue, Oct 7". */
export function formatLastDay(day: string): string {
  return lastDayFormat.format(fromDayKey(day));
}

/** `null` for a habit that isn't ending. */
export function endingStatus(habit: EndingHabit, today: string): EndingStatus | null {
  const lastDay = lastCountedDay(habit);
  if (lastDay === undefined) return null;
  const byEndDate = lastDay !== habit.endsAfter;

  const daysLeft = daysBetween(today, lastDay).length;
  if (byEndDate && daysLeft > END_DATE_SHOWN_DAYS) return null;
  const verb = byEndDate ? 'Finishes' : 'Ending';
  const finalPeriodDone = isDaily(habit)
    ? daysLeft === 1 && habit.completedToday
    : habitWeekEnd(habit, today) >= lastDay && habit.weekCount >= targetPerWeek(habit);
  const finished = daysLeft === 0 || finalPeriodDone;

  let label: string;
  if (daysLeft === 0) label = 'Wrapping up';
  else if (finished) {
    label =
      daysLeft === 1 ? 'Wraps up tonight' : `Wraps up ${weekdayFormat.format(fromDayKey(lastDay))}`;
  } else if (daysLeft === 1) label = `${verb} · last day`;
  else label = `${verb} · ${daysLeft} days left`;

  return { lastDay, byEndDate, daysLeft, finished, label };
}

/**
 * What the notice asks for, as concretely as it can: "Log it every day
 * through Tue, Oct 7.", "Log it 2 more times by Wed, Oct 7.", or, with a
 * week still to come, "Hit 3 this week and 3 next, through Wed, Oct 14."
 */
export function noticeRequirement(
  habit: Pick<HabitWithProgress, 'timesPerWeek' | 'startDay' | 'weekCount'>,
  lastDay: string,
  today: string,
): string {
  const through = formatLastDay(lastDay);
  if (isDaily(habit)) return `Log it every day through ${through}.`;

  const target = targetPerWeek(habit);
  if (habitWeekEnd(habit, today) < lastDay)
    return `Hit ${target} this week and ${target} next, through ${through}.`;

  const left = target - habit.weekCount;
  if (left <= 0) return `This week’s ${target} are in. Nothing more is due before ${through}.`;
  return `Log it ${left === 1 ? 'once more' : `${left} more times`} by ${through}.`;
}

/** What a miss during the notice costs, as "$20 is charged". `null` when nothing is on the line. */
export function noticeMissCost(stake: StakeView | null): string | null {
  if (stakeCost(stake).kind === 'none') return null;
  return skipConsequence([{ stakeView: stake }]).phrase;
}

/** What seeing the notice through keeps, as "your $20 is released". */
export function noticeKeeps(stake: StakeView | null): string {
  const cost = stakeCost(stake);
  switch (cost.kind) {
    case 'money':
      return `your ${formatCents(cost.cents)} is released`;
    case 'friend':
      return `${cost.name} never hears a thing`;
    case 'lockout':
      return 'the lockout is called off';
    case 'none':
      return 'nothing more is owed';
  }
}
