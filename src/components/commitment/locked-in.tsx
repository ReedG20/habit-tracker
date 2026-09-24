import { StyleSheet, View } from 'react-native';

import type { CommitmentDraft } from './draft';
import { Note } from './note';
import { StepLayout } from './step-layout';

import { ActionButton } from '@/components/action-button';
import { Countdown } from '@/components/countdown';
import { ThemedText } from '@/components/themed-text';
import { CardRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

export type LockedInProps = {
  draft: CommitmentDraft;
  onDone: () => void;
};

/** The confirmation after locking in: what was just agreed to, in one card. */
export function LockedIn({ draft, onDone }: LockedInProps) {
  const theme = useTheme();

  const stakes =
    draft.kind === 'habit'
      ? 'Miss a day and Ante locks'
      : draft.amountCents === null
        ? 'Your word'
        : `${formatCents(draft.amountCents)} on your card`;

  return (
    <StepLayout footer={<ActionButton label="Done" variant="primary" fill onPress={onDone} />}>
      <ThemedText style={styles.title} themeColor="text">
        It’s on.
      </ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Row label={draft.kind === 'habit' ? 'Habit' : 'Goal'} value={draft.title.trim()} />
        <Row label="Proof" value={`Photo: ${draft.proof.trim()}`} />
        {draft.kind === 'goal' ? (
          <View style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary">
              Deadline
            </ThemedText>
            <ThemedText themeColor="text">{formatDueAt(draft.dueAt)}</ThemedText>
            <Countdown deadlineAt={draft.dueAt} />
          </View>
        ) : (
          <Row label="When" value="Every day, before midnight" />
        )}
        <Row label="Stakes" value={stakes} />
      </View>

      <Note>{draft.kind === 'habit' ? 'day one starts now.' : 'clock’s running.'}</Note>
    </StepLayout>
  );
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
