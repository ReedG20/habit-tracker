import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { HabitSheetFields, type HabitDraft } from '@/components/habit-sheet-fields';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
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
  const draftRef = useRef<HabitDraft>({
    title: habit.title,
    description: habit.description ?? '',
  });

  return (
    <FormSheet
      title="Edit habit"
      submitLabel="Save changes"
      onSubmit={() => {
        const title = draftRef.current.title.trim();
        if (title.length === 0) return;

        const description = draftRef.current.description.trim();
        router.back();
        void update({
          habitId: habit._id,
          title,
          // `null` clears the stored description rather than leaving it behind.
          description: description.length > 0 ? description : null,
        }).catch((error: unknown) => {
          console.error('Failed to update the habit', error);
        });
      }}>
      <HabitSheetFields
        initial={{ title: habit.title, description: habit.description ?? '' }}
        draftRef={draftRef}
      />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: Spacing.six * 4,
  },
});
