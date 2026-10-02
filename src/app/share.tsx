import { useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, useWindowDimensions, View } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { SegmentedPicker } from '@/components/segmented-picker';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, ShareCard } from '@/components/share/share-card';
import { shareCardImage } from '@/components/share/share-image';
import { Switch } from '@/components/switch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardRadius, Spacing } from '@/constants/theme';
import type { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import type { ShareSubject } from '@/convex/share';
import {
  cardsFor,
  hasAmount,
  shareCopy,
  shareMessage,
  type ShareCardKind,
  type ShareSource,
} from '@/data/share-copy';
import { captureError, track } from '@/lib/analytics';
import { todayKey } from '@/lib/dates';
import { successHaptic } from '@/lib/haptics';
import { shareUrl } from '@/lib/share-links';

/** The sheet's detent in `_layout.tsx`. */
const SHEET_FRACTION = 0.9;
/** What the sheet needs besides the card: title, picker, amount row, actions. */
const SHEET_CHROME = 330;

const SOURCES: readonly ShareSource[] = ['locked_in', 'raise', 'restart', 'detail', 'kept'];
const CARD_LABELS: Record<ShareCardKind, string> = {
  streak: 'Streak',
  stake: 'Stakes',
  kept: 'Kept',
};

/**
 * Shares a commitment as a story card: the stakes just set, a streak still
 * going, or one seen through. Opened with exactly one of `habitId`, `goalId`
 * or `accomplishmentId`; `card` picks which card to open on when there's a
 * choice.
 */
export default function ShareScreen() {
  const params = useLocalSearchParams<{
    habitId?: string;
    goalId?: string;
    accomplishmentId?: string;
    card?: string;
    source?: string;
  }>();
  const [today] = useState(todayKey);
  const subject = useQuery(api.share.subject, {
    today,
    ...(params.habitId !== undefined && { habitId: params.habitId as Id<'habits'> }),
    ...(params.goalId !== undefined && { goalId: params.goalId as Id<'goals'> }),
    ...(params.accomplishmentId !== undefined && {
      accomplishmentId: params.accomplishmentId as Id<'accomplishments'>,
    }),
  });
  const source = SOURCES.find((value) => value === params.source) ?? 'detail';

  if (subject === undefined) {
    return <View style={styles.placeholder} />;
  }
  if (subject === null) {
    return (
      <FormSheet title="Nothing to share" submitLabel="Done" onSubmit={() => router.back()}>
        <ThemedText themeColor="textSecondary">It may have been deleted.</ThemedText>
      </FormSheet>
    );
  }

  const cards = cardsFor(subject);
  const initial = cards.find((card) => card === params.card) ?? cards[0];
  return <ShareSheet subject={subject} cards={cards} initial={initial} source={source} />;
}

function ShareSheet({
  subject,
  cards,
  initial,
  source,
}: {
  subject: ShareSubject;
  cards: ShareCardKind[];
  initial: ShareCardKind;
  source: ShareSource;
}) {
  const [card, setCard] = useState(initial);
  const [showAmount, setShowAmount] = useState(true);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<View>(null);
  const window = useWindowDimensions();

  useEffect(() => {
    track('share opened', { card: initial, source });
  }, [initial, source]);

  const copy = shareCopy(subject, card, showAmount);
  const scale = Math.min(
    (window.width - Spacing.three * 2) / SHARE_CARD_WIDTH,
    (window.height * SHEET_FRACTION - SHEET_CHROME) / SHARE_CARD_HEIGHT,
  );

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const activity = await shareCardImage(cardRef, shareMessage(copy, shareUrl(card)));
      track('share completed', {
        card,
        source,
        shown_amount: hasAmount(subject) && showAmount,
        activity,
      });
      if (activity !== 'dismissed') {
        successHaptic();
        router.back();
      }
    } catch (error: unknown) {
      console.error('Failed to share the card', error);
      captureError(error, 'share card');
      // Toasts sit under sheets, so this one says it in an alert.
      Alert.alert('Couldn’t share it', 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      title="Share it"
      submitLabel={busy ? 'One moment…' : 'Share'}
      onSubmit={() => void share()}
      submitDisabled={busy}>
      {cards.length > 1 ? (
        <SegmentedPicker
          options={cards.map((value) => ({ value, label: CARD_LABELS[value] }))}
          value={card}
          onChange={setCard}
        />
      ) : null}

      <View
        style={[
          styles.preview,
          { width: SHARE_CARD_WIDTH * scale, height: SHARE_CARD_HEIGHT * scale },
        ]}>
        <View style={[styles.scaled, { transform: [{ scale }] }]}>
          <ShareCard ref={cardRef} card={card} subject={subject} copy={copy} />
        </View>
      </View>

      {hasAmount(subject) ? (
        <ThemedView type="backgroundElement" style={styles.row}>
          <View style={styles.rowText}>
            <ThemedText themeColor="text">Show amount</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Off says “money” instead.
            </ThemedText>
          </View>
          <Switch value={showAmount} onChange={setShowAmount} accessibilityLabel="Show amount" />
        </ThemedView>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
  },
  preview: {
    alignSelf: 'center',
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  // Laid out full size and shrunk to fit, so the capture is the full-size card.
  scaled: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    transformOrigin: 'top left',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: CardRadius,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
});
