import { useState, type MutableRefObject } from 'react';

import { DueDateField } from '@/components/due-date-field';
import { TextField } from '@/components/text-field';

export type ProjectDraft = {
  title: string;
  description: string;
  dueDay: string | undefined;
};

export type ProjectSheetFieldsProps = {
  initial?: Partial<ProjectDraft>;
  draftRef: MutableRefObject<ProjectDraft>;
};

export function ProjectSheetFields({ initial, draftRef }: ProjectSheetFieldsProps) {
  const [dueDay, setDueDay] = useState<string | undefined>(initial?.dueDay);

  return (
    <>
      <TextField
        label="Name"
        defaultValue={initial?.title ?? ''}
        onChangeText={(text) => {
          draftRef.current.title = text;
        }}
        placeholder="Ship the habit tracker"
        autoCapitalize="sentences"
        returnKeyType="next"
      />
      <TextField
        label="Description (optional)"
        defaultValue={initial?.description ?? ''}
        onChangeText={(text) => {
          draftRef.current.description = text;
        }}
        placeholder="What does done look like?"
        multiline
      />
      <DueDateField
        dueDay={dueDay}
        onChange={(next) => {
          setDueDay(next);
          draftRef.current.dueDay = next;
        }}
      />
    </>
  );
}
