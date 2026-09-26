import { useClerk, useUser } from '@clerk/expo';
import type { IconSvgElement } from '@hugeicons/react-native';
import { useQuery } from 'convex/react';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  ArrowRight01Icon,
  Logout01Icon,
  Notification01Icon,
  Settings02Icon,
  SparklesIcon,
  Target02Icon,
  UserCircleIcon,
} from '@/constants/icons';
import { CardRadius, PillRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { currentStreak, formatStreak } from '@/data/habits';
import { describeSubscription } from '@/data/subscription';
import { useNow } from '@/hooks/use-now';
import { useSubscription } from '@/hooks/use-subscription';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { resetOnboarding } from '@/lib/onboarding';
import { manageSubscriptionsUrl, revenueCatSupported } from '@/lib/revenuecat';

/**
 * Tools for working on the app itself. Always in a debug build; in a preview
 * or TestFlight build only when `EXPO_PUBLIC_DEV_TOOLS=1` is set for it.
 */
const showDevTools = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1';

const settings: { id: string; label: string; icon: IconSvgElement; href?: '/preferences' }[] = [
  { id: 'reminders', label: 'Reminders', icon: Notification01Icon },
  { id: 'preferences', label: 'Preferences', icon: Settings02Icon, href: '/preferences' },
];

/**
 * Which code is running, e.g. `Ante 1.0.0 · update 01a0b759`. Tells an OTA
 * update apart from the bundle that shipped inside the build.
 */
function describeBuild(): string {
  const version = `Ante ${Constants.expoConfig?.version ?? '?'}`;

  if (!Updates.isEnabled) {
    return `${version} · dev`;
  }

  if (Updates.isEmbeddedLaunch || Updates.updateId === null) {
    return `${version} · embedded`;
  }

  return `${version} · update ${Updates.updateId.slice(0, 8)}`;
}

export default function MeScreen() {
  const theme = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();
  const habits = useQuery(api.habits.list, { today: todayKey() });
  const loggedCount = useQuery(api.habits.loggedCount);
  const stakeTotals = useQuery(api.goals.stakeTotals);
  const { isPro, summary } = useSubscription();
  const now = useNow();

  const displayName =
    user?.firstName ?? user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'You';

  const streak = habits === undefined ? undefined : currentStreak(habits);

  return (
    <ScreenScrollView>
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
          <Icon icon={UserCircleIcon} size={32} themeColor="textSecondary" />
        </View>
        <View style={styles.identityText}>
          <ThemedText style={styles.displayName} themeColor="text">
            {displayName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {habits === undefined
              ? ' '
              : `${habits.length} active habit${habits.length === 1 ? '' : 's'}`}
          </ThemedText>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.statRow}>
          <ThemedView type="backgroundElement" style={styles.statTile}>
            <ThemedText style={styles.statValue} themeColor="text">
              {streak === undefined ? ' ' : formatStreak(streak)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Current streak
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.statTile}>
            <ThemedText style={styles.statValue} themeColor="text">
              {loggedCount === undefined ? ' ' : String(loggedCount)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Habits logged
            </ThemedText>
          </ThemedView>
        </View>
        <View style={styles.statRow}>
          <ThemedView type="backgroundElement" style={styles.statTile}>
            <ThemedText style={styles.statValue} themeColor="text">
              {stakeTotals === undefined ? ' ' : formatCents(stakeTotals.onTheLineCents)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              On the line
            </ThemedText>
          </ThemedView>
          <ThemedView type="backgroundElement" style={styles.statTile}>
            <ThemedText style={styles.statValue} themeColor="text">
              {stakeTotals === undefined ? ' ' : formatCents(stakeTotals.keptCents)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Put up and kept
            </ThemedText>
          </ThemedView>
        </View>
      </View>

      <ThemedView type="backgroundElement" style={styles.settingsGroup}>
        {/* Hidden where there is no store: nothing to buy or manage on web. */}
        {revenueCatSupported && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ante Pro"
            // Apple owns cancellation and plan changes; the paywall only sells.
            // In a debug build it stays reachable while subscribed so it can
            // still be worked on — and Apple's screen does nothing in a
            // simulator regardless.
            onPress={() =>
              isPro && !__DEV__ ? void Linking.openURL(manageSubscriptionsUrl) : router.push('/pro')
            }
            style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}>
            <Icon icon={SparklesIcon} size={22} themeColor="primary" />
            <ThemedText style={styles.settingLabel}>Ante Pro</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {describeSubscription(summary, now)}
            </ThemedText>
            <Icon icon={ArrowRight01Icon} size={18} themeColor="textSecondary" />
          </Pressable>
        )}

        {settings.map(({ href, ...setting }, index) => (
          <Pressable
            key={setting.id}
            accessibilityRole="button"
            onPress={href && (() => router.push(href))}
            style={({ pressed }) => [
              styles.settingRow,
              (index > 0 || revenueCatSupported) && {
                borderTopWidth: 1,
                borderTopColor: theme.border,
              },
              pressed && styles.pressed,
            ]}>
            <Icon icon={setting.icon} size={22} themeColor="textSecondary" />
            <ThemedText style={styles.settingLabel}>{setting.label}</ThemedText>
            <Icon icon={ArrowRight01Icon} size={18} themeColor="textSecondary" />
          </Pressable>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => void signOut()}
          style={({ pressed }) => [
            styles.settingRow,
            { borderTopWidth: 1, borderTopColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <Icon icon={Logout01Icon} size={22} themeColor="textSecondary" />
          <ThemedText style={styles.settingLabel}>Sign out</ThemedText>
        </Pressable>
      </ThemedView>

      {showDevTools ? (
        <View style={styles.devTools}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.groupLabel}>
            Developer
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.settingsGroup}>
            {/* Flipping the stored status is enough: the root guard swaps the
                tabs for the onboarding stack. Signed in, the sign-in step is
                skipped and the paywall saves a real habit or goal. */}
            <Pressable
              accessibilityRole="button"
              onPress={resetOnboarding}
              style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}>
              <Icon icon={Target02Icon} size={22} themeColor="textSecondary" />
              <ThemedText style={styles.settingLabel}>Replay onboarding</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                resetOnboarding();
                void signOut();
              }}
              style={({ pressed }) => [
                styles.settingRow,
                { borderTopWidth: 1, borderTopColor: theme.border },
                pressed && styles.pressed,
              ]}>
              <Icon icon={Logout01Icon} size={22} themeColor="textSecondary" />
              <ThemedText style={styles.settingLabel}>Replay as a new user</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Signs out
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.buildInfo}>
        {describeBuild()}
      </ThemedText>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.five,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: PillRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    gap: Spacing.half,
  },
  displayName: ScreenHeadingTypography,
  statValue: ScreenHeadingTypography,
  stats: {
    gap: Spacing.three,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  statTile: {
    flex: 1,
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  settingsGroup: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  settingLabel: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  devTools: {
    gap: Spacing.two,
  },
  groupLabel: {
    paddingHorizontal: Spacing.three,
  },
  buildInfo: {
    textAlign: 'center',
  },
});
