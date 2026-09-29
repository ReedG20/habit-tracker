import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  draftProofMethod,
  MIN_LEAD_MS,
  wordingSignature,
  type CommitmentDraft,
  type CommitmentKind,
} from './draft';
import { GoalProofExplainer } from './goal-proof-explainer';
import { Note } from './note';
import { ProofIdeas } from './proof-ideas';
import { ProofMethodPicker } from './proof-method-picker';
import { StepLayout } from './step-layout';
import type { useNameCheck } from './use-name-check';
import type { useWordingCheck } from './use-wording-check';
import { WordingFeedback } from './wording-feedback';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Edit02Icon } from '@/constants/icons';
import { PROOF_METHODS } from '@/constants/proof-methods';
import { BorderRadius, Spacing } from '@/constants/theme';
import { shortFrequency } from '@/convex/lib/frequency';
import { track } from '@/lib/analytics';
import { formatDueAt } from '@/lib/dates';

/** A habit's proof field follows its method; a goal's is always about photos. */
function proofField(draft: CommitmentDraft): { label: string; placeholder: string; empty: string } {
  if (draft.kind === 'goal') {
    return {
      label: 'What will the photos show when it’s done?',
      placeholder: 'The live site open on my laptop, not a screenshot',
      empty: PROOF_METHODS.photo.emptyProof,
    };
  }
  const method = PROOF_METHODS[draft.proofMethod];
  return {
    label: method.proofLabel,
    placeholder: method.proofPlaceholder,
    empty: method.emptyProof,
  };
}

export type ProofPageProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  onNext: () => void;
  /** Back to the name page, from the recap at the top. */
  onEditName: () => void;
  /** The user chose a method themselves, so the best fit stops being applied. */
  onMethodPicked: () => void;
  nameCheck: ReturnType<typeof useNameCheck>;
  wording: ReturnType<typeof useWordingCheck>;
  suggestions?: Record<CommitmentKind, { title: string; proof: string }[]>;
};

/**
 * Step 1, second page: how it gets proven, and in what words. Every proof is
 * later judged against these words, so the wording is checked before moving
 * on, unless it's one of the name check's ideas, which were written to pass.
 */
export function ProofPage({
  draft,
  onChange,
  onNext,
  onEditName,
  onMethodPicked,
  nameCheck,
  wording,
  suggestions,
}: ProofPageProps) {
  const readProof = useRef<(() => string) | null>(null);
  // Bumped when an idea or suggestion replaces the text, remounting the field.
  const [fieldKey, setFieldKey] = useState(0);
  // Mirrors the field, so a picked idea shows as picked until it's edited.
  const [proofText, setProofText] = useState(draft.proof);
  const scrollRef = useRef<ScrollView>(null);

  const method = draftProofMethod(draft);
  const checked = nameCheck.lookup(draft.title);
  const ideas =
    checked !== undefined
      ? checked.ideas[method]
      : nameCheck.isChecking(draft.title)
        ? null
        : [];

  const readProofNow = () => readProof.current?.() ?? draft.proof;

  // Bring the feedback card into view: it sits under the proof field.
  useEffect(() => {
    if (wording.revision !== null) scrollRef.current?.scrollToEnd({ animated: true });
  }, [wording.revision]);

  const replaceProof = (proof: string) => {
    wording.dismiss();
    onChange({ proof });
    setProofText(proof);
    setFieldKey((key) => key + 1);
  };

  const next = async () => {
    if (wording.checking) return;

    const { title } = draft;
    const proof = readProofNow();
    onChange({ proof });

    if (proof.trim().length === 0) {
      Alert.alert(proofField(draft).empty, 'That is what the proof gets judged against.');
      return;
    }
    // The deadline may have passed while the proof was being written.
    if (draft.kind === 'goal' && draft.dueAt < Date.now() + MIN_LEAD_MS) {
      Alert.alert('Pick a deadline in the future');
      onEditName();
      return;
    }

    const signature = wordingSignature({ kind: draft.kind, proofMethod: method, title, proof });
    // Already passed, one of the name check's ideas, or one of onboarding's own
    // suggestions: no need to ask again. Onboarding's are written for photos.
    const vetted =
      draft.checkedWording === signature ||
      (ideas ?? []).includes(proof.trim()) ||
      (method === 'photo' &&
        (suggestions?.[draft.kind] ?? []).some(
          (suggestion) =>
            wordingSignature({ kind: draft.kind, proofMethod: method, ...suggestion }) ===
            signature,
        ));

    if (!vetted) {
      const revision = await wording.run({
        kind: draft.kind,
        title,
        proof,
        timesPerWeek: draft.kind === 'habit' ? draft.timesPerWeek : undefined,
        proofMethod: draft.kind === 'habit' ? method : undefined,
        timerMinutes: draft.kind === 'habit' && method === 'timer' ? draft.timerMinutes : undefined,
      });
      if (revision !== null) return;
      onChange({ checkedWording: signature });
    }

    onNext();
  };

  const useSuggestion = (suggestion: { title: string; proof: string }) => {
    replaceProof(suggestion.proof);
    onChange({
      ...suggestion,
      // The model wrote it to pass; asking it again would only add a wait.
      checkedWording: wordingSignature({ kind: draft.kind, proofMethod: method, ...suggestion }),
    });
    // A new name gets its own ideas.
    if (suggestion.title !== draft.title) void nameCheck.ensure(suggestion.title);
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
      <Recap draft={draft} onPress={onEditName} />

      {draft.kind === 'habit' ? (
        <ProofMethodPicker
          value={draft.proofMethod}
          bestMethod={checked?.bestMethod}
          onChange={(proofMethod) => {
            wording.dismiss();
            onMethodPicked();
            onChange({ proof: readProofNow(), proofMethod });
          }}
          timerMinutes={draft.timerMinutes}
          onTimerMinutesChange={(timerMinutes) =>
            onChange({ proof: readProofNow(), timerMinutes })
          }
        />
      ) : (
        <GoalProofExplainer />
      )}

      <View style={styles.proof}>
        <TextField
          key={`proof-${fieldKey}`}
          label={proofField(draft).label}
          defaultValue={draft.proof}
          readValueRef={readProof}
          onChangeText={(text) => {
            wording.dismiss();
            setProofText(text);
          }}
          placeholder={proofField(draft).placeholder}
          multiline
        />
        <ProofIdeas
          ideas={ideas}
          current={proofText}
          onPick={(idea) => {
            track('proof idea picked', { kind: draft.kind, method });
            replaceProof(idea);
          }}
        />
        <Note>be specific. vague proof is how people cheat themselves.</Note>
      </View>

      {wording.revision !== null ? (
        <WordingFeedback revision={wording.revision} onUseSuggestion={useSuggestion} />
      ) : null}
    </StepLayout>
  );
}

/** What the proof is written against, one tap from changing it. */
function Recap({ draft, onPress }: { draft: CommitmentDraft; onPress: () => void }) {
  const when =
    draft.kind === 'habit' ? shortFrequency(draft.timesPerWeek) : `by ${formatDueAt(draft.dueAt)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${draft.title}, ${when}. Edit`}
      onPress={onPress}
      style={({ pressed }) => [styles.recap, pressed && styles.pressed]}>
      <View style={styles.recapText}>
        <ThemedText style={styles.recapTitle} numberOfLines={2}>
          {draft.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {when}
        </ThemedText>
      </View>
      <Icon icon={Edit02Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  recap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: BorderRadius,
  },
  recapText: {
    flex: 1,
    gap: Spacing.half,
  },
  recapTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 700,
  },
  proof: {
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
