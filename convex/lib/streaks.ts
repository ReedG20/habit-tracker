import type { Doc, Id } from '../_generated/dataModel';
import { dailyRun, daysBefore, weeklyRun, weekStart } from './days';
import { DAILY } from './frequency';

/**
 * The one streak rule, kept pure so it can be tested without a database.
 * Every streak the app shows (the flame, the best run, the Kept and loss
 * screens) goes through here so they can't disagree.
 *
 * Frozen days bridge a run: they neither break it nor add to it. So does an
 * excused day (its last check `failed`, our error) for a daily habit, which is
 * how the calendar shows it. For a weekly habit an excused day stands in for
 * the log the check couldn't confirm, as it does in `findMisses`.
 */

type CheckRow = Pick<Doc<'habitVerifications'>, 'habitId' | 'day' | 'status' | 'createdAt'>;

/** The days whose newest check `failed`, by habit. A retake that went through un-excuses it. */
export function excusedDays(verifications: CheckRow[]): Map<Id<'habits'>, Set<string>> {
  const latest = new Map<string, CheckRow>();
  for (const verification of verifications) {
    const key = `${verification.habitId}|${verification.day}`;
    const seen = latest.get(key);
    if (seen === undefined || verification.createdAt > seen.createdAt) {
      latest.set(key, verification);
    }
  }

  const excused = new Map<Id<'habits'>, Set<string>>();
  for (const verification of latest.values()) {
    if (verification.status !== 'failed') continue;
    const days = excused.get(verification.habitId) ?? new Set<string>();
    days.add(verification.day);
    excused.set(verification.habitId, days);
  }
  return excused;
}

export type StreakInput = {
  /** `targetPerWeek(habit)`: 7 for a daily habit. */
  target: number;
  /** `weekStartsOn(habit)`. */
  startsOn: number;
  done: Set<string>;
  excused: Set<string>;
  frozen: Set<string>;
  /** The last day the run can end on: today, or the last day of a finished run. */
  through: string;
  /**
   * The oldest day `done`, `excused` and `frozen` were read from. When the run
   * reaches it, `reachesFrom` says the days before it are needed too.
   */
  from?: string;
};

/** The run ending at `through`, in days for a daily habit and in weeks for the rest. */
export function runOf({ target, startsOn, done, excused, frozen, through, from }: StreakInput): {
  streak: number;
  reachesFrom: boolean;
} {
  if (target >= DAILY) {
    const run = dailyRun(done, through, new Set([...frozen, ...excused]));
    return {
      streak: run.length,
      reachesFrom: from !== undefined && run.earliest !== undefined && run.earliest <= from,
    };
  }

  const run = weeklyRun(new Set([...done, ...excused]), through, target, startsOn, frozen);
  if (from === undefined || run.earliest === undefined) {
    return { streak: run.length, reachesFrom: false };
  }
  // The week `from` falls in was only partly read, so it may look short when it wasn't.
  const edgeWeek = weekStart(from, startsOn);
  const firstFullWeek = edgeWeek === from ? from : daysBefore(edgeWeek, -7);
  return { streak: run.length, reachesFrom: run.earliest <= firstFullWeek };
}
