import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { GoalSheetFields, type GoalDraft } from '@/components/goal-sheet-fields';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { Goal } from '@/data/goals';

export default function EditGoalScreen() {
  const { goalId: rawGoalId } = useLocalSearchParams<{ goalId: string }>();
  const goal = useQuery(api.goals.get, { goalId: rawGoalId as Id<'goals'> });

  if (!goal) {
    return <View style={styles.placeholder} />;
  }

  return <EditGoalForm key={goal._id} goal={goal} />;
}

function EditGoalForm({ goal }: { goal: Goal }) {
  const update = useMutation(api.goals.update);
  // The deadline is part of the commitment: locked once money is on it or it is done.
  const deadlineLocked = goal.stake !== undefined || goal.completedAt !== undefined;
  const initial: GoalDraft = {
    title: goal.title,
    description: goal.description ?? '',
    dueAt: goal.dueAt,
  };
  const draftRef = useRef<() => GoalDraft>(() => initial);

  return (
    <FormSheet
      title="Edit goal"
      submitLabel="Save changes"
      onSubmit={() => {
        const draft = draftRef.current();
        const title = draft.title.trim();
        if (title.length === 0) return;

        const description = draft.description.trim();
        router.back();
        void update({
          goalId: goal._id,
          title,
          description: description.length > 0 ? description : null,
          dueAt: deadlineLocked ? undefined : draft.dueAt,
        }).catch((error: unknown) => {
          console.error('Failed to update the goal', error);
        });
      }}>
      <GoalSheetFields initial={initial} draftRef={draftRef} showDeadline={!deadlineLocked} />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: Spacing.six * 4,
  },
});
