import { useRef, type MutableRefObject } from 'react';

import { TextField, type TextFieldHandle } from '@/components/text-field';
import { PROOF_METHODS, type ProofMethod } from '@/constants/proof-methods';
import { MAX_PROOF_LENGTH, MAX_TITLE_LENGTH } from '@/convex/lib/commitmentText';

export type HabitDraft = {
  title: string;
  description: string;
};

export type HabitSheetFieldsProps = {
  initial?: Partial<HabitDraft>;
  draftRef: MutableRefObject<HabitDraft>;
  /** Labels the proof field; the method itself is fixed once the habit is made. */
  proofMethod?: ProofMethod;
};

export function HabitSheetFields({
  initial,
  draftRef,
  proofMethod = 'photo',
}: HabitSheetFieldsProps) {
  const proofRef = useRef<TextFieldHandle>(null);
  const method = PROOF_METHODS[proofMethod];

  return (
    <>
      <TextField
        label="Name"
        defaultValue={initial?.title ?? ''}
        onChangeText={(text) => {
          draftRef.current.title = text;
        }}
        placeholder="Go to the gym"
        maxLength={MAX_TITLE_LENGTH}
        autoCapitalize="sentences"
        returnKeyType="next"
        onSubmit={() => proofRef.current?.focus()}
      />
      <TextField
        ref={proofRef}
        label={method.proofLabel}
        defaultValue={initial?.description ?? ''}
        onChangeText={(text) => {
          draftRef.current.description = text;
        }}
        placeholder={method.proofPlaceholder}
        maxLength={MAX_PROOF_LENGTH}
        multiline
      />
    </>
  );
}
