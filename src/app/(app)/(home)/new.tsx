import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { HabitSheetFields, type HabitDraft } from '@/components/habit-sheet-fields';
import { ProjectSheetFields, type ProjectDraft } from '@/components/project-sheet-fields';
import { SegmentedControl } from '@/components/segmented-control';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';

type Kind = 'habit' | 'project';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'habit', label: 'Habit' },
  { value: 'project', label: 'Project' },
];

export default function NewScreen() {
  const createHabit = useMutation(api.habits.create);
  const createProject = useMutation(api.projects.create);

  const [kind, setKind] = useState<Kind>('habit');
  // One draft per kind, so a submit reads the fields the toggle is showing.
  const habitDraft = useRef<HabitDraft>({ title: '', description: '' });
  const projectDraft = useRef<ProjectDraft>({ title: '', description: '', dueDay: undefined });

  const submitHabit = () => {
    const title = habitDraft.current.title.trim();
    if (title.length === 0) return;

    const description = habitDraft.current.description.trim();
    router.back();
    void createHabit({
      title,
      description: description.length > 0 ? description : undefined,
    }).catch((error: unknown) => {
      console.error('Failed to create the habit', error);
    });
  };

  const submitProject = () => {
    const title = projectDraft.current.title.trim();
    if (title.length === 0) return;

    const description = projectDraft.current.description.trim();
    router.back();
    void createProject({
      title,
      description: description.length > 0 ? description : undefined,
      dueDay: projectDraft.current.dueDay,
    }).catch((error: unknown) => {
      console.error('Failed to create the project', error);
    });
  };

  return (
    <FormSheet
      title="New"
      submitLabel={kind === 'habit' ? 'Create habit' : 'Create project'}
      onSubmit={kind === 'habit' ? submitHabit : submitProject}>
      <SegmentedControl options={KINDS} value={kind} onChange={setKind} />
      {/* Both stay mounted: hiding, not unmounting, is what keeps typed text on a toggle. */}
      <View style={[styles.fields, kind !== 'habit' && styles.hidden]}>
        <HabitSheetFields draftRef={habitDraft} />
      </View>
      <View style={[styles.fields, kind !== 'project' && styles.hidden]}>
        <ProjectSheetFields draftRef={projectDraft} />
      </View>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: Spacing.three,
  },
  hidden: {
    display: 'none',
  },
});
