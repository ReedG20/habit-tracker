import { useEffect, useRef } from 'react';

import { showToast } from '@/components/toast';
import type { GoalSubmissionSummary, GoalWithStatus } from '@/data/goals';

type Status = GoalSubmissionSummary['status'];

/**
 * Raises a toast the moment a submission comes back rejected or failed while
 * the screen is open. Only transitions count: a verdict that was already there
 * when the screen mounted is old news and stays quiet.
 */
export function useGoalSubmissionToasts(goals: GoalWithStatus[] | undefined) {
  const previous = useRef<Map<string, Status> | null>(null);

  useEffect(() => {
    if (goals === undefined) return;

    const next = new Map<string, Status>();
    for (const goal of goals) {
      if (goal.submission) next.set(goal._id, goal.submission.status);
    }

    if (previous.current !== null) {
      for (const goal of goals) {
        const status = next.get(goal._id);
        const before = previous.current.get(goal._id);
        if (status === before) continue;

        if (status === 'rejected') {
          showToast(
            `${goal.title} proof wasn't accepted`,
            goal.submission?.reason ?? 'Try other photos.',
          );
        } else if (status === 'failed') {
          showToast(`Couldn't check ${goal.title}`, 'Something went wrong. Try again.');
        } else if (before === 'pending' && goal.completedAt !== undefined) {
          // An approval completes the goal, and a completed goal carries no
          // submission summary, so this is what an approval looks like here.
          showToast(`${goal.title} is done`, 'Proof accepted. Nice work.');
        }
      }
    }

    previous.current = next;
  }, [goals]);
}
