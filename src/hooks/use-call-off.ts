import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useCallback } from 'react';

import { showToast } from '@/components/toast';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { StakeView } from '@/convex/lib/stakeRules';
import { callOffConfirm } from '@/data/call-off';
import { track } from '@/lib/analytics';
import { confirmDestructive } from '@/lib/confirm';
import { userErrorMessage } from '@/lib/user-errors';

export type CallOffTarget = { goalId: Id<'goals'> } | { habitId: Id<'habits'> };

/**
 * Calling a commitment off from its detail screen, while it still can be:
 * a confirm that says what won't happen, then it's gone. Shared by the
 * banner and the header's Delete, so the two never disagree.
 */
export function useCallOff() {
  const removeGoal = useMutation(api.goals.remove);
  const removeHabit = useMutation(api.habits.remove);

  return useCallback(
    ({
      target,
      stake,
      until,
    }: {
      target: CallOffTarget;
      stake: StakeView | null;
      until: number;
    }) => {
      const { title, message } = callOffConfirm(stake);
      confirmDestructive({
        title,
        message,
        confirmLabel: 'Call it off',
        onConfirm: () => {
          // Leave first: the screen's queries resolve to null once the row is gone.
          router.back();
          const removed =
            'goalId' in target
              ? removeGoal({ goalId: target.goalId })
              : removeHabit({ habitId: target.habitId });
          removed
            .then(() => {
              track('commitment called off', {
                kind: 'goalId' in target ? 'goal' : 'habit',
                stake_kind: stake?.kind ?? 'none',
                minutes_left: Math.max(0, Math.round((until - Date.now()) / 60_000)),
              });
              showToast('Called off', 'Nothing’s on the line.', 'success');
            })
            .catch((error: unknown) => {
              showToast('Couldn’t call it off', userErrorMessage(error, 'Try again in a moment.'));
            });
        },
      });
    },
    [removeGoal, removeHabit],
  );
}
