import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { alertRevision, useWordingCheck } from '@/components/commitment/use-wording-check';
import { FormSheet } from '@/components/form-sheet';
import { HabitSheetFields, type HabitDraft } from '@/components/habit-sheet-fields';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { targetPerWeek } from '@/convex/lib/frequency';
import type { Habit } from '@/data/habits';

export default function EditHabitScreen() {
  const { habitId: rawHabitId } = useLocalSearchParams<{ habitId: string }>();
  const habit = useQuery(api.habits.get, { habitId: rawHabitId as Id<'habits'> });

  // Usually resolves from cache, since the detail screen behind this sheet
  // subscribes to the same query with the same arguments.
  if (!habit) {
    return <View style={styles.placeholder} />;
  }

  // Keyed so the draft state resets if the sheet is reopened for another habit.
  return <EditHabitForm key={habit._id} habit={habit} />;
}

function EditHabitForm({ habit }: { habit: Habit }) {
  const update = useMutation(api.habits.update);
  const wording = useWordingCheck();
  const [initial, setInitial] = useState<HabitDraft>({
    title: habit.title,
    description: habit.description ?? '',
  });
  // Bumped to remount the fields with a suggestion's text.
  const [fieldsKey, setFieldsKey] = useState(0);
  const draftRef = useRef<HabitDraft>({ ...initial });
  // Wording that is already on the habit, or that the check wrote, needs no second look.
  const vetted = useRef(new Set([`${habit.title.trim()}\n${(habit.description ?? '').trim()}`]));

  const save = async () => {
    if (wording.checking) return;

    const title = draftRef.current.title.trim();
    if (title.length === 0) return;
    const description = draftRef.current.description.trim();

    if (!vetted.current.has(`${title}\n${description}`)) {
      const revision = await wording.run({
        kind: 'habit',
        title,
        proof: description,
        timesPerWeek: targetPerWeek(habit),
      });
      if (revision !== null) {
        alertRevision(revision, (suggestion) => {
          vetted.current.add(`${suggestion.title}\n${suggestion.proof}`);
          const next = { title: suggestion.title, description: suggestion.proof };
          draftRef.current = { ...next };
          setInitial(next);
          setFieldsKey((key) => key + 1);
        });
        return;
      }
    }

    router.back();
    void update({
      habitId: habit._id,
      title,
      // `null` clears the stored description rather than leaving it behind.
      description: description.length > 0 ? description : null,
    }).catch((error: unknown) => {
      console.error('Failed to update the habit', error);
    });
  };

  return (
    <FormSheet
      title="Edit habit"
      submitLabel={wording.checking ? 'Checking…' : 'Save changes'}
      submitDisabled={wording.checking}
      onSubmit={() => void save()}>
      <HabitSheetFields key={fieldsKey} initial={initial} draftRef={draftRef} />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: Spacing.six * 4,
  },
});
