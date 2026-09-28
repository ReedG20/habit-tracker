import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { ThemedText } from './themed-text';

import { Fonts, Spacing } from '@/constants/theme';
import type { SubscriptionSummary } from '@/data/subscription';
import { formatShortDate } from '@/lib/dates';

export type ProPausedBannerProps = {
  /** The subscription that ended, or `null` when there never was one. */
  summary: SubscriptionSummary | null;
};

/**
 * Today's banner without Ante Pro, in place of the stakes: nothing is being
 * checked, so there is no fee to warn about, only the way back.
 */
export function ProPausedBanner({ summary }: ProPausedBannerProps) {
  const endedAt = summary?.expiresAt;
  const lapsed = summary !== null;

  return (
    <View style={styles.banner}>
      <ThemedText style={styles.title} themeColor="text">
        {lapsed ? 'Your habits are paused' : 'Nothing’s on the line yet'}
      </ThemedText>
      <ThemedText style={styles.body} themeColor="textSecondary">
        {lapsed
          ? `Ante Pro ended${endedAt === undefined ? '' : ` ${formatShortDate(endedAt)}`}. Nothing counts against you until you resubscribe, and goals you made still run to their deadline.`
          : 'Start Ante Pro to make a commitment. Nothing counts against you until you do.'}
      </ThemedText>
      <ActionButton
        label={lapsed ? 'Resubscribe' : 'Start Ante Pro'}
        variant="primary"
        onPress={() => router.navigate('/pro')}
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  title: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.two,
  },
});
