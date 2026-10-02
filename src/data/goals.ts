import type { Doc } from '@/convex/_generated/dataModel';
import type { GoalSubmissionSummary, GoalWithStatus } from '@/convex/goals';

export type Goal = Doc<'goals'>;
export type { GoalSubmissionSummary, GoalWithStatus };

/** Inside this window the card counts down to the deadline. */
export const COUNTDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isMissed(goal: Goal, now: number): boolean {
  return goal.completedAt === undefined && goal.dueAt <= now;
}

/** Done or missed: it has left the live list for Past. */
export function isGoalOver(goal: Goal, now: number): boolean {
  return goal.completedAt !== undefined || goal.dueAt <= now;
}
