import { useEffect, useRef } from 'react';

import { showToast } from '@/components/toast';
import type { HabitWithProgress } from '@/data/habits';

type Status = HabitWithProgress['verification'] extends infer V
  ? V extends { status: infer S }
    ? S
    : never
  : never;

/**
 * Raises a toast the moment a photo check comes back rejected or failed while
 * the screen is open. Only transitions count: a verdict that was already there
 * when the screen mounted is old news and stays quiet.
 */
export function useVerificationToasts(habits: HabitWithProgress[] | undefined) {
  const previous = useRef<Map<string, Status> | null>(null);

  useEffect(() => {
    if (habits === undefined) return;

    const next = new Map<string, Status>();
    for (const habit of habits) {
      if (habit.verification) next.set(habit._id, habit.verification.status);
    }

    if (previous.current !== null) {
      for (const habit of habits) {
        const status = next.get(habit._id);
        const before = previous.current.get(habit._id);
        if (status === before) continue;

        if (status === 'rejected') {
          showToast(
            `${habit.title} wasn't verified`,
            habit.verification?.reason ?? 'Try another photo.',
          );
        } else if (status === 'failed') {
          showToast(`Couldn't check ${habit.title}`, 'Something went wrong. Try again.');
        }
      }
    }

    previous.current = next;
  }, [habits]);
}
