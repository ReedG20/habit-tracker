import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useRef } from 'react';

import { FormSheet } from '@/components/form-sheet';
import { HabitSheetFields, type HabitDraft } from '@/components/habit-sheet-fields';
import { api } from '@/convex/_generated/api';

export default function NewHabitScreen() {
  const create = useMutation(api.habits.create);
  const draftRef = useRef<HabitDraft>({ title: '', description: '' });

  return (
    <FormSheet
      title="New habit"
      submitLabel="Create habit"
      onSubmit={() => {
        const title = draftRef.current.title.trim();
        if (title.length === 0) return;

        const description = draftRef.current.description.trim();
        router.back();
        void create({
          title,
          description: description.length > 0 ? description : undefined,
        }).catch((error: unknown) => {
          console.error('Failed to create the habit', error);
        });
      }}>
      <HabitSheetFields draftRef={draftRef} />
    </FormSheet>
  );
}
