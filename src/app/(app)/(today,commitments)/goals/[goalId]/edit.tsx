import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { alertRevision, useWordingCheck } from '@/components/commitment/use-wording-check';
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
  const wording = useWordingCheck();
  // The deadline is part of the commitment: locked once money is on it or it is done.
  const deadlineLocked = goal.stake !== undefined || goal.completedAt !== undefined;
  const [initial, setInitial] = useState<GoalDraft>({
    title: goal.title,
    description: goal.description ?? '',
    dueAt: goal.dueAt,
  });
  // Bumped to remount the fields with a suggestion's text.
  const [fieldsKey, setFieldsKey] = useState(0);
  const draftRef = useRef<() => GoalDraft>(() => initial);
  // Wording that is already on the goal, or that the check wrote, needs no second look.
  const vetted = useRef(new Set([`${goal.title.trim()}\n${(goal.description ?? '').trim()}`]));

  const save = async () => {
    if (wording.checking) return;

    const draft = draftRef.current();
    const title = draft.title.trim();
    if (title.length === 0) return;
    const description = draft.description.trim();

    if (!vetted.current.has(`${title}\n${description}`)) {
      const revision = await wording.run({ kind: 'goal', title, proof: description });
      if (revision !== null) {
        alertRevision(revision, (suggestion) => {
          vetted.current.add(`${suggestion.title}\n${suggestion.proof}`);
          // Keep a deadline picked in this sheet; only the words change.
          setInitial({
            title: suggestion.title,
            description: suggestion.proof,
            dueAt: draft.dueAt,
          });
          setFieldsKey((key) => key + 1);
        });
        return;
      }
    }

    router.back();
    void update({
      goalId: goal._id,
      title,
      description: description.length > 0 ? description : null,
      dueAt: deadlineLocked ? undefined : draft.dueAt,
    }).catch((error: unknown) => {
      console.error('Failed to update the goal', error);
    });
  };

  return (
    <FormSheet
      title="Edit goal"
      submitLabel={wording.checking ? 'Checking…' : 'Save changes'}
      submitDisabled={wording.checking}
      onSubmit={() => void save()}>
      <GoalSheetFields
        key={fieldsKey}
        initial={initial}
        draftRef={draftRef}
        showDeadline={!deadlineLocked}
      />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: Spacing.six * 4,
  },
});
