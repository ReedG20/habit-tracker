import type { Doc } from '@/convex/_generated/dataModel';
import type { GoalSubmissionSummary, GoalWithStatus } from '@/convex/goals';

export type Goal = Doc<'goals'>;
export type { GoalSubmissionSummary, GoalWithStatus };

export type GoalSectionId = 'active' | 'missed' | 'done';

export type GoalSection = {
  id: GoalSectionId;
  title: string;
  items: GoalWithStatus[];
};

/** Inside this window the card counts down to the deadline. */
export const COUNTDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isMissed(goal: Goal, now: number): boolean {
  return goal.completedAt === undefined && goal.dueAt <= now;
}

/**
 * Active goals stay on top, soonest first (the input arrives sorted by
 * `dueAt`); missed ones follow so a charge is never hidden, and done sinks.
 */
export function groupGoals(goals: GoalWithStatus[], now: number): GoalSection[] {
  const active: GoalWithStatus[] = [];
  const missed: GoalWithStatus[] = [];
  const done: GoalWithStatus[] = [];

  for (const goal of goals) {
    if (goal.completedAt !== undefined) {
      done.push(goal);
    } else if (isMissed(goal, now)) {
      missed.push(goal);
    } else {
      active.push(goal);
    }
  }

  const sections: GoalSection[] = [
    { id: 'active', title: 'active', items: active },
    { id: 'missed', title: 'missed', items: missed },
    { id: 'done', title: 'done', items: done },
  ];

  return sections.filter((section) => section.items.length > 0);
}
