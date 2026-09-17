import type { MutableRefObject } from 'react';

import { TextField } from '@/components/text-field';

export type HabitDraft = {
  title: string;
  description: string;
};

export type HabitSheetFieldsProps = {
  initial?: Partial<HabitDraft>;
  draftRef: MutableRefObject<HabitDraft>;
};

export function HabitSheetFields({ initial, draftRef }: HabitSheetFieldsProps) {
  return (
    <>
      <TextField
        label="Name"
        defaultValue={initial?.title ?? ''}
        onChangeText={(text) => {
          draftRef.current.title = text;
        }}
        placeholder="Go to the gym"
        autoCapitalize="sentences"
        returnKeyType="next"
      />
      <TextField
        label="Description (optional)"
        defaultValue={initial?.description ?? ''}
        onChangeText={(text) => {
          draftRef.current.description = text;
        }}
        placeholder="What does doing this well look like?"
        multiline
      />
    </>
  );
}
