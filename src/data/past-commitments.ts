import type { EndedHabitView } from '@/convex/endedHabits';
import { isGoalOver, type GoalWithStatus } from '@/data/goals';

export type { EndedHabitView };

/** `endedAt` is when it left the live list: proven, missed, or deleted. */
export type PastItem =
  | { kind: 'goal'; goal: GoalWithStatus; endedAt: number }
  | { kind: 'habit'; habit: EndedHabitView; endedAt: number };

/**
 * Commitments that are over, newest first: goals done or missed, and habits
 * deleted (`endedHabits.list`). The live lists never show them; this is the
 * only place they stay.
 */
export function pastCommitments(
  goals: GoalWithStatus[],
  endedHabits: EndedHabitView[],
  now: number,
): PastItem[] {
  const items: PastItem[] = [
    ...goals
      .filter((goal) => isGoalOver(goal, now))
      .map((goal) => ({ kind: 'goal' as const, goal, endedAt: goal.completedAt ?? goal.dueAt })),
    ...endedHabits.map((habit) => ({ kind: 'habit' as const, habit, endedAt: habit.endedAt })),
  ];
  return items.sort((a, b) => b.endedAt - a.endedAt);
}
