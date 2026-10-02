import { useQuery } from 'convex/react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnteProLockup } from '@/components/brand/ante-pro-lockup';
import { Icon } from '@/components/icon';
import { ProPaywall, type PaywallOutcome } from '@/components/pro-paywall';
import { ThemedText } from '@/components/themed-text';
import { Cancel01Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { paywallHeaderCopy } from '@/data/pro-lock';
import { useSubscription } from '@/hooks/use-subscription';
import { useTheme } from '@/hooks/use-theme';
import type { PaywallSource } from '@/lib/analytics-events';
import { todayKey } from '@/lib/dates';

export type ProPaywallScreenProps = {
  source: Exclude<PaywallSource, 'onboarding'>;
  onClose: () => void;
  onFinished: (outcome: PaywallOutcome) => void;
};

/**
 * The paywall as a whole page, with its title fitted to why it opened: `/pro`,
 * and the gate in front of `/new` and `/restart`. Onboarding has its own.
 */
export function ProPaywallScreen({ source, onClose, onFinished }: ProPaywallScreenProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { isPro, summary } = useSubscription();
  const habits = useQuery(api.habits.list, { today: todayKey() });
  const copy = paywallHeaderCopy({ summary, pausedHabits: habits?.length ?? 0, source });

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={Spacing.three}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Icon icon={Cancel01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
          <ThemedText type="small" themeColor="textSecondary">
            Close
          </ThemedText>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        alwaysBounceVertical={false}>
        <ProPaywall
          source={source}
          header={
            // Once subscribed, the default "Ante Pro" block says it better.
            isPro ? undefined : (
              <View style={styles.header}>
                <AnteProLockup size={18} style={styles.lockup} />
                <ThemedText style={styles.title} themeColor="text">
                  {copy.title}
                </ThemedText>
                <ThemedText themeColor="textSecondary">{copy.subtitle}</ThemedText>
              </View>
            )
          }
          onDismiss={onClose}
          onFinished={onFinished}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  bar: {
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
  },
  close: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  content: {
    paddingHorizontal: Spacing.three,
  },
  header: {
    gap: Spacing.two,
  },
  lockup: {
    marginBottom: Spacing.one,
  },
  title: ScreenHeadingTypography,
  pressed: {
    opacity: 0.7,
  },
});
