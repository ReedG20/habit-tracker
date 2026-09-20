import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useRef } from 'react';

import { FormSheet } from '@/components/form-sheet';
import { HabitSheetFields, type HabitDraft } from '@/components/habit-sheet-fields';
import { api } from '@/convex/_generated/api';

export default function NewHabitScreen() {
  const createHabit = useMutation(api.habits.create);
  const draft = useRef<HabitDraft>({ title: '', description: '' });

  const submit = () => {
    const title = draft.current.title.trim();
    if (title.length === 0) return;

    const description = draft.current.description.trim();
    router.back();
    void createHabit({
      title,
      description: description.length > 0 ? description : undefined,
    }).catch((error: unknown) => {
      console.error('Failed to create the habit', error);
    });
  };

  return (
    <FormSheet title="New habit" submitLabel="Create habit" onSubmit={submit}>
      <HabitSheetFields draftRef={draft} />
    </FormSheet>
  );
}
