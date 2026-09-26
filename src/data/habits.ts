import type { Doc } from '@/convex/_generated/dataModel';
import { daysLeftInWeek } from '@/convex/lib/days';
import { DAILY, targetPerWeek } from '@/convex/lib/frequency';
import { fromDayKey } from '@/lib/dates';

export type Habit = Doc<'habits'>;
export type HabitCompletion = Doc<'habitCompletions'>;
export type HabitVerification = Doc<'habitVerifications'>;

/** Today's latest verification while the habit is still incomplete; see `habits.list`. */
export type HabitVerificationSummary = {
  status: HabitVerification['status'];
  reason?: string;
};

/** What `api.habits.list` returns: a habit plus today's state, this week's count and its streak. */
export type HabitWithProgress = Habit & {
  completedToday: boolean;
  weekCount: number;
  streak: number;
  verification: HabitVerificationSummary | null;
};

export function isDaily(habit: Pick<Habit, 'timesPerWeek'>): boolean {
  return targetPerWeek(habit) >= DAILY;
}

/** A weekly habit that has already hit this week's target. */
export function isWeekDone(habit: HabitWithProgress): boolean {
  return !isDaily(habit) && habit.weekCount >= targetPerWeek(habit);
}

/** Nothing left to do today: logged already, or this week's target is met. */
export function isDoneForToday(habit: HabitWithProgress): boolean {
  return habit.completedToday || isWeekDone(habit);
}

/**
 * A weekly habit with no slack left: the logs it still needs this week take
 * every remaining day, today included, so skipping today means ending short.
 */
export function mustLogToday(habit: HabitWithProgress, today: string): boolean {
  if (isDaily(habit) || isDoneForToday(habit)) return false;

  const needed = targetPerWeek(habit) - habit.weekCount;
  return needed >= daysLeftInWeek(today);
}

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

/**
 * "Ends tonight" / "Ends Sunday" for a habit deleted while still owed (see
 * `habits.remove`); `null` for one that is not ending.
 */
export function describeEnding(habit: Pick<Habit, 'endsAfter'>, today: string): string | null {
  if (habit.endsAfter === undefined) return null;
  if (habit.endsAfter <= today) return 'Ends tonight';
  return `Ends ${weekdayFormat.format(fromDayKey(habit.endsAfter))}`;
}

/** Daily habits count streaks in days, weekly ones in weeks that hit the target. */
export type Streak = { count: number; unit: 'day' | 'week' };

/**
 * The streak the home and Me screens headline: the longest current run across
 * daily habits, or across weekly ones when no daily habit has a run going.
 */
export function currentStreak(habits: HabitWithProgress[]): Streak {
  const longest = (daily: boolean) =>
    habits
      .filter((habit) => isDaily(habit) === daily)
      .reduce((max, habit) => Math.max(max, habit.streak), 0);

  const days = longest(true);
  if (days > 0) return { count: days, unit: 'day' };

  const weeks = longest(false);
  if (weeks > 0) return { count: weeks, unit: 'week' };

  // Nothing running yet: say it in the unit the habits are kept in.
  const onlyWeekly = habits.length > 0 && !habits.some(isDaily);
  return { count: 0, unit: onlyWeekly ? 'week' : 'day' };
}

/** "1 day", "3 weeks". */
export function formatStreak({ count, unit }: Streak): string {
  return count === 1 ? `1 ${unit}` : `${count} ${unit}s`;
}
