import { useEffect, useRef } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, View } from 'react-native';

import { MIN_LEAD_MS, type CommitmentDraft, type CommitmentKind } from './draft';
import { Note } from './note';
import { ProofMethodPicker } from './proof-method-picker';
import { StepLayout } from './step-layout';

import { ActionButton } from '@/components/action-button';
import { DeadlineField } from '@/components/deadline-field';
import { SegmentedPicker } from '@/components/segmented-picker';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';

const kindOptions: { value: CommitmentKind; label: string }[] = [
  { value: 'habit', label: 'Habit · repeats' },
  { value: 'goal', label: 'Goal · one deadline' },
];

const placeholders: Record<CommitmentKind, { title: string; proof: string }> = {
  habit: {
    title: 'Go to the gym',
    proof: 'Me at the gym with the equipment in view, not the parking lot',
  },
  goal: {
    title: 'Ship the landing page',
    proof: 'The live site open on my laptop, not a screenshot',
  },
};

export type WhatStepProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  onNext: () => void;
};

/** Step 1: what exactly, by when, and what counts as proof. */
export function WhatStep({ draft, onChange, onNext }: WhatStepProps) {
  // The fields are uncontrolled; they are read into the draft when leaving the step.
  const readTitle = useRef<(() => string) | null>(null);
  const readProof = useRef<(() => string) | null>(null);

  // With the keyboard up the body is shorter than the step, so keep the field
  // being typed in on screen: the name sits at the top, the proof at the bottom.
  const scrollRef = useRef<ScrollView>(null);
  const focused = useRef<'title' | 'proof' | null>(null);
  const revealFocused = () => {
    if (focused.current === 'proof') scrollRef.current?.scrollToEnd({ animated: true });
    if (focused.current === 'title') scrollRef.current?.scrollTo({ y: 0, animated: true });
  };
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => revealFocused());
    return () => subscription.remove();
  }, []);
  const trackFocus = (field: 'title' | 'proof', isFocused: boolean) => {
    if (isFocused) {
      focused.current = field;
      if (Keyboard.isVisible()) revealFocused();
    } else if (focused.current === field) {
      focused.current = null;
    }
  };

  const readFields = () => ({
    title: readTitle.current?.() ?? draft.title,
    proof: readProof.current?.() ?? draft.proof,
  });

  const next = () => {
    const { title, proof } = readFields();
    onChange({ title, proof });

    if (title.trim().length === 0) {
      Alert.alert(draft.kind === 'habit' ? 'Give the habit a name' : 'Give the goal a name');
      return;
    }
    if (proof.trim().length === 0) {
      Alert.alert(
        'Say what the photo needs to show',
        'That is what the proof gets judged against.',
      );
      return;
    }
    if (draft.kind === 'goal' && draft.dueAt < Date.now() + MIN_LEAD_MS) {
      Alert.alert('Pick a deadline in the future');
      return;
    }

    onNext();
  };

  return (
    <StepLayout
      scrollRef={scrollRef}
      footer={<ActionButton label="Next: set the stakes" variant="primary" fill onPress={next} />}>
      <SegmentedPicker
        options={kindOptions}
        value={draft.kind}
        // Carry the typed text across: the fields stay mounted, but the draft should match them.
        onChange={(kind) => onChange({ ...readFields(), kind })}
      />

      <TextField
        label="Name"
        defaultValue={draft.title}
        readValueRef={readTitle}
        onFocusChange={(isFocused) => trackFocus('title', isFocused)}
        placeholder={placeholders[draft.kind].title}
        autoCapitalize="sentences"
        returnKeyType="next"
      />

      {draft.kind === 'goal' ? (
        <DeadlineField value={draft.dueAt} onChange={(dueAt) => onChange({ dueAt })} />
      ) : null}

      <ProofMethodPicker />

      <View style={styles.proof}>
        <TextField
          label="What does the photo need to show?"
          defaultValue={draft.proof}
          readValueRef={readProof}
          onFocusChange={(isFocused) => trackFocus('proof', isFocused)}
          placeholder={placeholders[draft.kind].proof}
          multiline
        />
        <Note>be specific. vague proof is how people cheat themselves.</Note>
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  proof: {
    gap: Spacing.two,
  },
});
