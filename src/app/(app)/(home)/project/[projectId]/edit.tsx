import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { ProjectSheetFields, type ProjectDraft } from '@/components/project-sheet-fields';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { Project } from '@/data/projects';

export default function EditProjectScreen() {
  const { projectId: rawProjectId } = useLocalSearchParams<{ projectId: string }>();
  const project = useQuery(api.projects.get, { projectId: rawProjectId as Id<'projects'> });

  if (!project) {
    return <View style={styles.placeholder} />;
  }

  return <EditProjectForm key={project._id} project={project} />;
}

function EditProjectForm({ project }: { project: Project }) {
  const update = useMutation(api.projects.update);
  const draftRef = useRef<ProjectDraft>({
    title: project.title,
    description: project.description ?? '',
    dueDay: project.dueDay,
  });

  return (
    <FormSheet
      title="Edit project"
      submitLabel="Save changes"
      onSubmit={() => {
        const title = draftRef.current.title.trim();
        if (title.length === 0) return;

        const description = draftRef.current.description.trim();
        router.back();
        void update({
          projectId: project._id,
          title,
          description: description.length > 0 ? description : null,
          dueDay: draftRef.current.dueDay ?? null,
        }).catch((error: unknown) => {
          console.error('Failed to update the project', error);
        });
      }}>
      <ProjectSheetFields
        initial={{
          title: project.title,
          description: project.description ?? '',
          dueDay: project.dueDay,
        }}
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
