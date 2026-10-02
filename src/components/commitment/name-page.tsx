import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { MIN_LEAD_MS, type CommitmentDraft, type CommitmentKind } from './draft';
import { FrequencyPicker } from './frequency-picker';
import { IconTile } from './icon-tile';
import { StepLayout } from './step-layout';
import { TitleField } from './title-field';
import type { NameCheckResult, useNameCheck } from './use-name-check';
import type { WordingRevision } from './use-wording-check';
import { WordingFeedback } from './wording-feedback';

import { ActionButton } from '@/components/action-button';
import { DeadlineField } from '@/components/deadline-field';
import { DeadlinePresets } from '@/components/deadline-presets';
import { Icon } from '@/components/icon';
import { ChoiceChip } from '@/components/onboarding/choice-chip';
import { SegmentedPicker } from '@/components/segmented-picker';
import type { TextFieldHandle } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { LockIcon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { MAX_TITLE_LENGTH } from '@/convex/lib/commitmentText';
import { useTheme } from '@/hooks/use-theme';

const kindOptions: { value: CommitmentKind; label: string }[] = [
  { value: 'habit', label: 'Habit · repeats' },
  { value: 'goal', label: 'Goal · one deadline' },
];

const titlePlaceholders: Record<CommitmentKind, string> = {
  habit: 'Go to the gym',
  goal: 'Ship the landing page',
};

export type NamePageProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  nameCheck: ReturnType<typeof useNameCheck>;
  /** The name passed its check: on to the proof. */
  onNext: (result: NameCheckResult) => void;
  suggestions?: Record<CommitmentKind, { title: string; proof: string }[]>;
  /** Why no more of this kind can be made right now (`lib/commitmentLimits.ts`), or null. */
  full?: string | null;
};

/**
 * Step 1, first page: what it is, and how often or by when. The name is
 * checked in the background as it's typed (`useNameCheck`), so moving on is
 * usually instant; a name that can't be proven is only raised on Next.
 */
export function NamePage({
  draft,
  onChange,
  nameCheck,
  onNext,
  suggestions,
  full = null,
}: NamePageProps) {
  const theme = useTheme();
  const readTitle = useRef<(() => string) | null>(null);
  // Bumped when the name is replaced, remounting the field with the new text.
  const [fieldKey, setFieldKey] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [revision, setRevision] = useState<{
    feedback: WordingRevision;
    result: NameCheckResult;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const titleRef = useRef<TextFieldHandle>(null);
  // The name as typed so far, for the icon; the field itself is uncontrolled.
  const [typed, setTyped] = useState(draft.title);

  const readTitleNow = () => readTitle.current?.() ?? draft.title;

  // The name check's icon for the name, kept while the next one is out so
  // the tile doesn't blink back to the default between pauses in typing.
  const checked = nameCheck.lookup(typed);
  const [lastChecked, setLastChecked] = useState(checked);
  if (checked !== undefined && checked !== lastChecked) setLastChecked(checked);
  const suggestedIcon = (checked ?? lastChecked)?.icon ?? null;
  const named = typed.trim().length > 0;
  const shownIcon = draft.iconChosen === true ? (draft.icon ?? null) : named ? suggestedIcon : null;

  // Bring the feedback card into view: it sits under the fields.
  useEffect(() => {
    if (revision !== null) scrollRef.current?.scrollToEnd({ animated: true });
  }, [revision]);

  const next = async () => {
    if (waiting) return;

    const title = readTitleNow().trim();
    onChange({ title });

    if (title.length === 0) {
      Alert.alert(draft.kind === 'habit' ? 'Give the habit a name' : 'Give the goal a name');
      return;
    }
    if (draft.kind === 'goal' && draft.dueAt < Date.now() + MIN_LEAD_MS) {
      Alert.alert('Pick a deadline in the future');
      return;
    }

    let result = nameCheck.lookup(title);
    if (result === undefined) {
      setWaiting(true);
      try {
        result = await nameCheck.ensure(title);
      } finally {
        setWaiting(false);
      }
    }

    if (!result.ok) {
      setRevision({
        feedback: {
          feedback: result.feedback ?? '',
          suggestion:
            result.suggestedTitle === null ? null : { title: result.suggestedTitle, proof: '' },
        },
        result,
      });
      return;
    }
    onNext(result);
  };

  const takeSuggestedName = (title: string) => {
    if (revision === null) return;
    nameCheck.adopt(title, revision.result);
    setRevision(null);
    onChange({ title });
    setTyped(title);
    setFieldKey((key) => key + 1);
  };

  return (
    <StepLayout
      scrollRef={scrollRef}
      footer={
        <ActionButton
          label={waiting ? 'Checking…' : 'Next: how you’ll prove it'}
          variant="primary"
          fill
          disabled={waiting || full !== null}
          onPress={() => void next()}
        />
      }
      // Pinned, so switching between habit and goal is always one tap away.
      header={
        <SegmentedPicker
          options={kindOptions}
          value={draft.kind}
          onChange={(kind) => {
            const title = readTitleNow();
            setRevision(null);
            onChange({ title, kind });
            // A goal's ideas differ from a habit's: check the name again for this kind.
            nameCheck.schedule(title);
          }}
        />
      }>
      {full !== null ? (
        <View style={[styles.full, { backgroundColor: theme.backgroundElement }]}>
          <Icon icon={LockIcon} size={20} strokeWidth={2} themeColor="textSecondary" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.fullText}>
            {full}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.titleRow}>
        <IconTile
          kind={draft.kind}
          icon={shownIcon}
          suggested={named ? suggestedIcon : null}
          pending={draft.iconChosen !== true && named && checked === undefined && nameCheck.busy}
          onPick={(icon) =>
            onChange(
              icon === null
                ? { icon: suggestedIcon ?? undefined, iconChosen: false }
                : { icon, iconChosen: true },
            )
          }
        />
        <View style={styles.titleField}>
          <TitleField
            ref={titleRef}
            key={`title-${fieldKey}`}
            accessibilityLabel={draft.kind === 'habit' ? 'Habit name' : 'Goal name'}
            defaultValue={draft.title}
            placeholder={titlePlaceholders[draft.kind]}
            maxLength={MAX_TITLE_LENGTH}
            autoFocus={draft.title.length === 0 && fieldKey === 0}
            readValueRef={readTitle}
            onChangeText={(text) => {
              if (revision !== null) setRevision(null);
              setTyped(text);
              nameCheck.schedule(text);
            }}
            // Return: the name is done, so the keyboard makes way for the rest of the page.
            onSubmit={() => titleRef.current?.blur()}
          />
        </View>
      </View>

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
                  setRevision(null);
                  onChange({ title: suggestion.title, proof: suggestion.proof });
                  setTyped(suggestion.title);
                  setFieldKey((key) => key + 1);
                  void nameCheck.ensure(suggestion.title);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {draft.kind === 'habit' ? (
        <FrequencyPicker
          value={draft.timesPerWeek}
          onChange={(timesPerWeek) => onChange({ title: readTitleNow(), timesPerWeek })}
        />
      ) : (
        <View style={styles.deadline}>
          <DeadlineField value={draft.dueAt} onChange={(dueAt) => onChange({ dueAt })} />
          <DeadlinePresets value={draft.dueAt} onChange={(dueAt) => onChange({ dueAt })} />
          <ThemedText type="small" themeColor="textSecondary">
            Proof has to be accepted before then. Send it early if you like, and retry as often as
            you need until time’s up.
          </ThemedText>
        </View>
      )}

      {revision !== null ? (
        <WordingFeedback
          revision={revision.feedback}
          onUseSuggestion={(suggestion) => takeSuggestedName(suggestion.title)}
        />
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  full: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: BorderRadius,
  },
  fullText: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  titleField: {
    flex: 1,
  },
  suggestions: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  deadline: {
    gap: Spacing.two,
  },
});
