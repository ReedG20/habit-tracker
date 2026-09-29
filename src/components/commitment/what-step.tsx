import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { MIN_LEAD_MS, wordingSignature, type CommitmentDraft, type CommitmentKind } from './draft';
import { FrequencyPicker } from './frequency-picker';
import { GoalProofExplainer } from './goal-proof-explainer';
import { Note } from './note';
import { ProofMethodPicker } from './proof-method-picker';
import { StepLayout } from './step-layout';
import { useWordingCheck } from './use-wording-check';
import { WordingFeedback } from './wording-feedback';

import { ActionButton } from '@/components/action-button';
import { ChoiceChip } from '@/components/onboarding/choice-chip';
import { DeadlineField } from '@/components/deadline-field';
import { SegmentedPicker } from '@/components/segmented-picker';
import { TextField, type TextFieldHandle } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const kindOptions: { value: CommitmentKind; label: string }[] = [
  { value: 'habit', label: 'Habit · repeats' },
  { value: 'goal', label: 'Goal · one deadline' },
];

const proofLabels: Record<CommitmentKind, string> = {
  habit: 'What does the photo need to show?',
  goal: 'What will the photos show when it’s done?',
};

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
  /** Presets shown as chips above the name, per kind; onboarding fills them from the survey. */
  suggestions?: Record<CommitmentKind, { title: string; proof: string }[]>;
};

/**
 * Step 1: what exactly, how often or by when, and what counts as proof. The
 * wording is checked before moving on, since every photo is judged against it.
 */
export function WhatStep({ draft, onChange, onNext, suggestions }: WhatStepProps) {
  const wording = useWordingCheck();

  // The fields are uncontrolled; they are read into the draft when leaving the step.
  const readTitle = useRef<(() => string) | null>(null);
  const readProof = useRef<(() => string) | null>(null);
  // Bumped when a suggestion is picked, remounting the fields with its text.
  const [fieldsKey, setFieldsKey] = useState(0);

  const scrollRef = useRef<ScrollView>(null);
  // Return on the name moves on to the proof, the field it's written against.
  const proofRef = useRef<TextFieldHandle>(null);

  const readFields = () => ({
    title: readTitle.current?.() ?? draft.title,
    proof: readProof.current?.() ?? draft.proof,
  });

  // Bring the feedback card into view: it sits under the proof field.
  useEffect(() => {
    if (wording.revision !== null) scrollRef.current?.scrollToEnd({ animated: true });
  }, [wording.revision]);

  const next = async () => {
    if (wording.checking) return;

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

    const signature = wordingSignature({ kind: draft.kind, title, proof });
    // Already passed, or one of onboarding's own suggestions: no need to ask again.
    const vetted =
      draft.checkedWording === signature ||
      (suggestions?.[draft.kind] ?? []).some(
        (suggestion) => wordingSignature({ kind: draft.kind, ...suggestion }) === signature,
      );

    if (!vetted) {
      const revision = await wording.run({
        kind: draft.kind,
        title,
        proof,
        timesPerWeek: draft.kind === 'habit' ? draft.timesPerWeek : undefined,
      });
      if (revision !== null) return;
      onChange({ checkedWording: signature });
    }

    onNext();
  };

  const useSuggestion = (suggestion: { title: string; proof: string }) => {
    wording.dismiss();
    onChange({
      ...suggestion,
      // The model wrote it to pass; asking it again would only add a wait.
      checkedWording: wordingSignature({ kind: draft.kind, ...suggestion }),
    });
    setFieldsKey((key) => key + 1);
  };

  return (
    <StepLayout
      scrollRef={scrollRef}
      // Tighter than other steps, so the whole form fits without scrolling on most phones.
      gap={Spacing.three}
      footer={
        <ActionButton
          label={wording.checking ? 'Checking…' : 'Next: set the stakes'}
          variant="primary"
          fill
          disabled={wording.checking}
          onPress={() => void next()}
        />
      }
      // Pinned, so switching between habit and goal is always one tap away.
      header={
        <SegmentedPicker
          options={kindOptions}
          value={draft.kind}
          // Carry the typed text across: the fields stay mounted, but the draft should match them.
          onChange={(kind) => {
            wording.dismiss();
            onChange({ ...readFields(), kind });
          }}
        />
      }>
      {suggestions !== undefined && suggestions[draft.kind].length > 0 ? (
        <View style={styles.suggestions}>
          <ThemedText type="small" themeColor="textSecondary">
            Need an idea?
          </ThemedText>
          <View style={styles.chips}>
            {suggestions[draft.kind].map((suggestion) => (
              <ChoiceChip
                key={suggestion.title}
                label={suggestion.title}
                selected={draft.title === suggestion.title}
                onPress={() => {
                  wording.dismiss();
                  onChange({ title: suggestion.title, proof: suggestion.proof });
                  setFieldsKey((key) => key + 1);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      <TextField
        key={`title-${fieldsKey}`}
        label="Name"
        defaultValue={draft.title}
        readValueRef={readTitle}
        onChangeText={wording.dismiss}
        placeholder={placeholders[draft.kind].title}
        autoCapitalize="sentences"
        returnKeyType="next"
        onSubmit={() => proofRef.current?.focus()}
      />

      {draft.kind === 'habit' ? (
        <>
          <FrequencyPicker
            value={draft.timesPerWeek}
            onChange={(timesPerWeek) => onChange({ ...readFields(), timesPerWeek })}
          />
          <ProofMethodPicker />
        </>
      ) : (
        <>
          <DeadlineField value={draft.dueAt} onChange={(dueAt) => onChange({ dueAt })} />
          <GoalProofExplainer />
        </>
      )}

      <View style={styles.proof}>
        <TextField
          ref={proofRef}
          key={`proof-${fieldsKey}`}
          label={proofLabels[draft.kind]}
          defaultValue={draft.proof}
          readValueRef={readProof}
          onChangeText={wording.dismiss}
          placeholder={placeholders[draft.kind].proof}
          multiline
        />
        <Note>be specific. vague proof is a way out.</Note>
      </View>

      {wording.revision !== null ? (
        <WordingFeedback revision={wording.revision} onUseSuggestion={useSuggestion} />
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  suggestions: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  proof: {
    gap: Spacing.two,
  },
});
