// Only type imports from `_generated`, so the app bundle can import this file too.
import type { Doc } from '../_generated/dataModel';

/**
 * How many commitments one user can have going at once, shared by the server,
 * which enforces it, and the app, which says so before anything is typed.
 *
 * A commitment carries at most one stake, so this also bounds the friends who
 * could be emailed and the lockouts that could fire. Money has its own cap
 * (`MONEY_CAP_CENTS`). Only new commitments are refused: anyone already over
 * keeps what they have.
 */

export const MAX_ACTIVE_HABITS = 10;
export const MAX_OPEN_GOALS = 6;

export type LimitedKind = 'habit' | 'goal';

/**
 * A habit counts while it's active. A broken one, waiting to be restarted,
 * doesn't, and nor does one that's ending: restarting or keeping it going
 * takes a free slot again.
 */
export function isHabitActive(habit: Pick<Doc<'habits'>, 'brokenAt' | 'endsAfter'>): boolean {
  return habit.brokenAt === undefined && habit.endsAfter === undefined;
}

/** A goal counts until it's proven or its deadline passes. */
export function isGoalOpen(
  goal: Pick<Doc<'goals'>, 'completedAt' | 'dueAt'>,
  now: number,
): boolean {
  return goal.completedAt === undefined && goal.dueAt > now;
}

export function limitFor(kind: LimitedKind): number {
  return kind === 'habit' ? MAX_ACTIVE_HABITS : MAX_OPEN_GOALS;
}

/** What a full slate says, on the New screen and in the server's refusal. */
export function limitMessage(kind: LimitedKind): string {
  return kind === 'habit'
    ? `You have ${MAX_ACTIVE_HABITS} habits going, the most Ante allows at once. End one to make room.`
    : `You have ${MAX_OPEN_GOALS} goals open, the most Ante allows at once. Finish one to make room.`;
}
