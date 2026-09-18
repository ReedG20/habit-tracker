import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useRef } from 'react';

import { FormSheet } from '@/components/form-sheet';
import { ProjectSheetFields, type ProjectDraft } from '@/components/project-sheet-fields';
import { api } from '@/convex/_generated/api';

export default function NewProjectScreen() {
  const create = useMutation(api.projects.create);
  const draftRef = useRef<ProjectDraft>({
    title: '',
    description: '',
    dueDay: undefined,
  });

  return (
    <FormSheet
      title="New project"
      submitLabel="Create project"
      onSubmit={() => {
        const title = draftRef.current.title.trim();
        if (title.length === 0) return;

        const description = draftRef.current.description.trim();
        router.back();
        void create({
          title,
          description: description.length > 0 ? description : undefined,
          dueDay: draftRef.current.dueDay,
        }).catch((error: unknown) => {
          console.error('Failed to create the project', error);
        });
      }}>
      <ProjectSheetFields draftRef={draftRef} />
    </FormSheet>
  );
}
