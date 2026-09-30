import { StyleSheet, View } from 'react-native';

import { friendName, proofSummary } from './contract-text';
import { lockoutLabel, type CommitmentDraft } from './draft';
import { Note } from './note';
import { StepLayout } from './step-layout';

import { ActionButton } from '@/components/action-button';
import { Countdown } from '@/components/countdown';
import { ThemedText } from '@/components/themed-text';
import { CardRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { DAILY, frequencyLabel } from '@/convex/lib/frequency';
import { useTheme } from '@/hooks/use-theme';
import { formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

export type LockedInProps = {
  draft: CommitmentDraft;
  onDone: () => void;
  /** "It's on." unless given: a raise says so. */
  title?: string;
  /** The handwritten aside under the card, when the usual one doesn't fit. */
  note?: string;
};

/** The confirmation after locking in: what was just agreed to, in one card. */
export function LockedIn({ draft, onDone, title = 'It’s on.', note }: LockedInProps) {
  const theme = useTheme();
  const daily = draft.timesPerWeek >= DAILY;
  const stakes = stakesLine(draft, daily);

  return (
    <StepLayout footer={<ActionButton label="Done" variant="primary" fill onPress={onDone} />}>
      <ThemedText style={styles.title} themeColor="text">
        {title}
      </ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Row label={draft.kind === 'habit' ? 'Habit' : 'Goal'} value={draft.title.trim()} />
        <Row label="Proof" value={proofSummary(draft)} />
        {draft.kind === 'goal' ? (
          <View style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary">
              Deadline
            </ThemedText>
            <ThemedText themeColor="text">{formatDueAt(draft.dueAt)}</ThemedText>
            <Countdown deadlineAt={draft.dueAt} />
          </View>
        ) : (
          <Row
            label="When"
            value={
              daily
                ? 'Every day, before midnight'
                : `${frequencyLabel(draft.timesPerWeek)}, any days, Monday to Sunday`
            }
          />
        )}
        <Row label="Stakes" value={stakes} />
      </View>

      <Note>
        {note ??
          (draft.kind === 'goal'
            ? 'clock’s running.'
            : daily
              ? 'day one starts now.'
              : 'week one starts now.')}
      </Note>
    </StepLayout>
  );
}

/** The stakes row: what's on the line, in the words of the kind picked. */
function stakesLine(draft: CommitmentDraft, daily: boolean): string {
  const miss = draft.kind === 'goal' ? 'Miss it' : daily ? 'Miss a day' : 'End a week short';
  switch (draft.stakeKind) {
    case 'money':
      return draft.kind === 'goal'
        ? `${formatCents(draft.amountCents)} on your card`
        : `${formatCents(draft.amountCents)} on your card, charged once if the streak breaks`;
    case 'friend':
      return `${miss} and ${friendName(draft)} hears about it. We just sent them a heads-up.`;
    case 'lockout':
      return `${miss} and your habits freeze for ${lockoutLabel(draft.lockoutDays)}`;
    case 'none':
      return 'Your word';
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText themeColor="text">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    ...ScreenHeadingTypography,
    fontSize: 56,
    lineHeight: 72,
  },
  card: {
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: {
    gap: Spacing.half,
  },
});
