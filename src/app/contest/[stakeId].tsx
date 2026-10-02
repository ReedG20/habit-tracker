import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { ChoiceCard } from '@/components/onboarding/choice-card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { contestNeedsNote, type ContestReason } from '@/convex/lib/chargeReviewSchema';
import { CONTEST_REASONS } from '@/data/contest';
import { track } from '@/lib/analytics';
import { cardLabel, formatCents } from '@/lib/money';
import { userErrorMessage } from '@/lib/user-errors';

/**
 * "Something wrong with this charge?": contests a money charge so it reaches
 * a person (`chargeReviews.request`) instead of the bank. Once sent, the same
 * sheet shows where it stands.
 */
export default function ContestScreen() {
  const { stakeId: rawStakeId } = useLocalSearchParams<{ stakeId: string }>();
  const stakeId = rawStakeId as Id<'stakes'>;
  const loss = useQuery(api.stakes.loss, { stakeId });
  const review = useQuery(api.chargeReviews.forStake, { stakeId });

  if (loss === undefined || review === undefined) {
    return <View style={styles.placeholder} />;
  }
  if (loss === null || loss.stake.kind !== 'money') {
    return (
      <FormSheet title="Charge not found" submitLabel="Done" onSubmit={() => router.back()}>
        <ThemedText themeColor="textSecondary">
          It may have been removed. Email support@useanteapp.com if you need a hand.
        </ThemedText>
      </FormSheet>
    );
  }

  const amount = formatCents(loss.stake.amountCents);
  const card = cardLabel(loss.stake);

  if (review !== null || loss.stake.status === 'refunded') {
    const refunded = loss.stake.status === 'refunded' || review?.status === 'refunded';
    const { title, body } = refunded
      ? {
          title: 'Refunded',
          body: `${amount} is on its way back to ${card}. Banks take 5–10 days to show it.`,
        }
      : review?.status === 'declined'
        ? {
            title: 'We looked into it',
            body:
              review.response ??
              'We’re keeping this charge. Email support@useanteapp.com to talk it over.',
          }
        : {
            title: 'Sent. We’re on it.',
            body: `A person reads every one, usually within a day. If we got it wrong, the ${amount} goes back to ${card} and you’ll get a notification.`,
          };
    return (
      <FormSheet title={title} submitLabel="Done" onSubmit={() => router.back()}>
        <ThemedText themeColor="textSecondary">{body}</ThemedText>
      </FormSheet>
    );
  }

  return <ContestForm stakeId={stakeId} title={loss.title} amount={amount} card={card} />;
}

function ContestForm({
  stakeId,
  title,
  amount,
  card,
}: {
  stakeId: Id<'stakes'>;
  title: string;
  amount: string;
  card: string;
}) {
  const request = useMutation(api.chargeReviews.request);
  const [reason, setReason] = useState<ContestReason | null>(null);
  const [hasNote, setHasNote] = useState(false);
  const [sending, setSending] = useState(false);
  const readNote = useRef<(() => string) | null>(null);
  const needsNote = reason !== null && contestNeedsNote(reason);

  const send = async () => {
    if (reason === null || sending) return;
    setSending(true);
    try {
      // The sheet turns into "Sent" on its own once the review exists.
      const note = readNote.current?.().trim() ?? '';
      await request({ stakeId, reason, note: note.length > 0 ? note : undefined });
      track('charge contested', { reason, has_note: note.length > 0 });
    } catch (error: unknown) {
      Alert.alert('Couldn’t send that', userErrorMessage(error, 'Try again in a moment.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <FormSheet
      title="Something wrong with this charge?"
      submitLabel={sending ? 'Sending…' : 'Send'}
      submitDisabled={reason === null || (needsNote && !hasNote) || sending}
      onSubmit={() => void send()}>
      <ThemedText themeColor="textSecondary">
        {`${amount} on ${card} for “${title}”. Tell us what happened. A person reads every one, usually within a day. If we got it wrong, or something serious came up, you can get your money back.`}
      </ThemedText>
      <View style={styles.reasons} accessibilityRole="radiogroup">
        {CONTEST_REASONS.map((option) => (
          <ChoiceCard
            key={option.reason}
            title={option.label}
            selected={reason === option.reason}
            onPress={() => setReason(option.reason)}
          />
        ))}
      </View>
      {needsNote ? (
        <ThemedText type="small" themeColor="textSecondary">
          We refund real emergencies, like a hospital stay or a family emergency. A busy week
          doesn’t count.
        </ThemedText>
      ) : null}
      <TextField
        label={needsNote ? 'What happened?' : 'Anything we should know? (optional)'}
        readValueRef={readNote}
        onChangeText={(value) => setHasNote(value.trim().length > 0)}
        placeholder="What happened, in a sentence or two"
        maxLength={1000}
        multiline
      />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
  },
  reasons: {
    gap: Spacing.two,
  },
});
