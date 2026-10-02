import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnteProLockup } from '@/components/brand/ante-pro-lockup';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ArrowRight01Icon } from '@/constants/icons';
import { CardRadius, PillRadius, Spacing } from '@/constants/theme';
import { describeSubscription, proOfferCopy } from '@/data/subscription';
import { useNow } from '@/hooks/use-now';
import { useSubscription } from '@/hooks/use-subscription';
import { useTheme } from '@/hooks/use-theme';
import { openPaywall } from '@/lib/paywall';
import { manageSubscriptionsUrl } from '@/lib/revenuecat';

/**
 * Ante Pro on Me, in a card of its own. Without Pro it's the violet way in;
 * with it, a quiet card like the rest of Me saying what the plan does next.
 */
export function ProCard() {
  const theme = useTheme();
  const now = useNow();
  const { isPro, summary } = useSubscription();

  // Apple owns cancellation and plan changes; the paywall only sells. In a
  // debug build it stays reachable while subscribed so it can still be worked
  // on — and Apple's screen does nothing in a simulator regardless.
  const onPress = () =>
    isPro && !__DEV__ ? void Linking.openURL(manageSubscriptionsUrl) : openPaywall('me');

  if (isPro) {
    const status = describeSubscription(summary, now);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ante Pro, ${status}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}>
        <View style={styles.memberRow}>
          <View style={styles.memberText}>
            <AnteProLockup />
            <ThemedText
              type="small"
              themeColor={summary?.status === 'billing_issue' ? 'accent' : 'textSecondary'}>
              {status}
            </ThemedText>
          </View>
          <Icon icon={ArrowRight01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
        </View>
      </Pressable>
    );
  }

  const offer = proOfferCopy(summary);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ante Pro. ${offer.line} ${offer.action}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.offer,
        { backgroundColor: theme.primary },
        pressed && styles.pressed,
      ]}>
      <AnteProLockup tone="inverse" />
      <Text style={[styles.offerLine, { color: theme.onPrimary }]}>{offer.line}</Text>
      <View style={[styles.cta, { backgroundColor: theme.onPrimary }]}>
        <Text style={[styles.ctaLabel, { color: theme.primary }]}>{offer.action}</Text>
        <Icon icon={ArrowRight01Icon} size={18} strokeWidth={2.5} color={theme.primary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CardRadius,
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  memberText: {
    flex: 1,
    gap: Spacing.one,
  },
  offer: {
    gap: Spacing.two,
  },
  offerLine: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    opacity: 0.85,
  },
  cta: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    borderRadius: PillRadius,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two + Spacing.half,
    paddingVertical: Spacing.two,
    marginTop: Spacing.one,
  },
  ctaLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
});
