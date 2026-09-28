import { useRef, type MutableRefObject } from 'react';

import { TextField, type TextFieldHandle } from '@/components/text-field';

export type HabitDraft = {
  title: string;
  description: string;
};

export type HabitSheetFieldsProps = {
  initial?: Partial<HabitDraft>;
  draftRef: MutableRefObject<HabitDraft>;
};

export function HabitSheetFields({ initial, draftRef }: HabitSheetFieldsProps) {
  const proofRef = useRef<TextFieldHandle>(null);

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
        onSubmit={() => proofRef.current?.focus()}
      />
      <TextField
        ref={proofRef}
        label="What does the photo need to show?"
        defaultValue={initial?.description ?? ''}
        onChangeText={(text) => {
          draftRef.current.description = text;
        }}
        placeholder="Me at the gym with the equipment in view"
        multiline
      />
    </>
  );
}
