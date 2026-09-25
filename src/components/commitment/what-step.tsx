import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, View } from 'react-native';

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
import { TextField } from '@/components/text-field';
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
      footer={
        <ActionButton
          label={wording.checking ? 'Checking…' : 'Next: set the stakes'}
          variant="primary"
          fill
          disabled={wording.checking}
          onPress={() => void next()}
        />
      }>
      <SegmentedPicker
        options={kindOptions}
        value={draft.kind}
        // Carry the typed text across: the fields stay mounted, but the draft should match them.
        onChange={(kind) => {
          wording.dismiss();
          onChange({ ...readFields(), kind });
        }}
      />

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
        onFocusChange={(isFocused) => trackFocus('title', isFocused)}
        onChangeText={wording.dismiss}
        placeholder={placeholders[draft.kind].title}
        autoCapitalize="sentences"
        returnKeyType="next"
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
          key={`proof-${fieldsKey}`}
          label={proofLabels[draft.kind]}
          defaultValue={draft.proof}
          readValueRef={readProof}
          onFocusChange={(isFocused) => trackFocus('proof', isFocused)}
          onChangeText={wording.dismiss}
          placeholder={placeholders[draft.kind].proof}
          multiline
        />
        <Note>be specific. vague proof is how people cheat themselves.</Note>
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
