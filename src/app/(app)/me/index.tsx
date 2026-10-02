import { useUser } from '@clerk/expo';
import type { IconSvgElement } from '@hugeicons/react-native';
import { useMutation, useQuery } from 'convex/react';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AnteWordmark } from '@/components/brand/ante-wordmark';
import { ProBadge } from '@/components/brand/pro-badge';
import { DeleteAccountRow } from '@/components/delete-account-row';
import { Icon } from '@/components/icon';
import { HelpCard } from '@/components/me/help-card';
import { ProCard } from '@/components/me/pro-card';
import { ProgressCalendar } from '@/components/progress-calendar';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { StatsPager } from '@/components/stats-pager';
import { Switch } from '@/components/switch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  ArrowRight01Icon,
  CoinsDollarIcon,
  Delete02Icon,
  Flag02Icon,
  LockKeyholeIcon,
  Logout01Icon,
  Notification01Icon,
  Settings02Icon,
  SparklesIcon,
  Target02Icon,
  UserCircleIcon,
} from '@/constants/icons';
import {
  CardRadius,
  PillRadius,
  ScreenHeadingTypography,
  Spacing,
  type ThemeColor,
} from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { DEFAULT_REMINDER_SETTINGS, PRESET_RULES } from '@/convex/lib/reminderPresets';
import { currentStreak, formatStreak } from '@/data/habits';
import { resetDailyPaywall } from '@/hooks/use-daily-paywall';
import { useSignOut } from '@/hooks/use-sign-out';
import { useSubscription } from '@/hooks/use-subscription';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/dates';
import { setForceDelete, showDevTools, useForceDelete } from '@/lib/dev-tools';
import { openKept } from '@/lib/kept-screen';
import { openGrace } from '@/lib/grace-screen';
import { openLoss } from '@/lib/loss-screen';
import { formatCents } from '@/lib/money';
import { useNotificationPermission } from '@/lib/notifications';
import { resetOnboarding } from '@/lib/onboarding';
import { revenueCatSupported } from '@/lib/revenuecat';

const settings: {
  id: string;
  label: string;
  icon: IconSvgElement;
  href?: '/preferences' | '/me/reminders';
}[] = [
  { id: 'reminders', label: 'Reminders', icon: Notification01Icon, href: '/me/reminders' },
  { id: 'preferences', label: 'Preferences', icon: Settings02Icon, href: '/preferences' },
];

/**
 * Which code is running, e.g. `1.0.0 · update 01a0b759`, under the wordmark.
 * Tells an OTA update apart from the bundle that shipped inside the build.
 */
function describeBuild(): string {
  const version = Constants.expoConfig?.version ?? '?';

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
  const signOut = useSignOut();
  const habits = useQuery(api.habits.list, { today: todayKey() });
  const loggedCount = useQuery(api.habits.loggedCount);
  const stakeTotals = useQuery(api.stakes.totals);
  const { isPro } = useSubscription();
  const reminderSettings = useQuery(api.reminders.settings);
  const notificationPermission = useNotificationPermission();
  // Only on deployments that honour them (`ANTE_DEV_OVERRIDES`), never production.
  const devOverrides = useQuery(api.lockouts.devOverrides, showDevTools ? {} : 'skip');
  const forceDelete = useForceDelete();
  const devLose = useMutation(api.stakes.devLose);
  const devGrace = useMutation(api.graces.devGrace);
  const devKept = useMutation(api.accomplishments.devPreview);
  const devFreeze = useMutation(api.freezes.devFreeze);
  const devLift = useMutation(api.freezes.devLift);
  const freeze = useQuery(api.freezes.current, showDevTools ? {} : 'skip');
  const devGrantPro = useMutation(api.subscriptions.devGrantPro);
  const devEndPro = useMutation(api.subscriptions.devEndPro);
  const devPreviewNotices = useMutation(api.accountNotices.devPreview);

  const displayName =
    user?.firstName ?? user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'You';

  const streak = habits === undefined ? undefined : currentStreak(habits);

  // The preset beside Reminders, or that iOS has them off, which makes it moot.
  // Nothing while loading, so the row doesn't flash the default.
  const remindersValue: { label: string; color: ThemeColor } | null =
    notificationPermission === 'denied'
      ? { label: 'Off', color: 'accent' }
      : reminderSettings === undefined
        ? null
        : {
            label: PRESET_RULES[(reminderSettings ?? DEFAULT_REMINDER_SETTINGS).preset].label,
            color: 'textSecondary',
          };

  return (
    <ScreenScrollView>
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
          <Icon icon={UserCircleIcon} size={32} themeColor="textSecondary" />
        </View>
        <View style={styles.identityText}>
          <View style={styles.nameRow}>
            <ThemedText style={styles.displayName} themeColor="text" numberOfLines={1}>
              {displayName}
            </ThemedText>
            {isPro ? <ProBadge /> : null}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {habits === undefined
              ? ' '
              : `${habits.length} active habit${habits.length === 1 ? '' : 's'}`}
          </ThemedText>
        </View>
      </View>

      <StatsPager pageLabels={['Show stats', 'Show calendar']}>
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
        <ProgressCalendar />
      </StatsPager>

      {/* Hidden where there is no store: nothing to buy or manage on web. */}
      {revenueCatSupported && <ProCard />}

      <ThemedView type="backgroundElement" style={styles.settingsGroup}>
        {settings.map(({ href, ...setting }, index) => (
          <Pressable
            key={setting.id}
            accessibilityRole="button"
            onPress={href && (() => router.push(href))}
            style={({ pressed }) => [
              styles.settingRow,
              index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <Icon icon={setting.icon} size={22} themeColor="textSecondary" />
            <ThemedText style={styles.settingLabel}>{setting.label}</ThemedText>
            {setting.id === 'reminders' && remindersValue !== null ? (
              <ThemedText type="small" themeColor={remindersValue.color}>
                {remindersValue.label}
              </ThemedText>
            ) : null}
            <Icon icon={ArrowRight01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
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

      <HelpCard />

      <DeleteAccountRow />

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
            {devOverrides === true ? (
              <>
                {/* Deletes skip the wait for a habit still owed, and goals with
                    money on them can go. Off again on the next launch. */}
                <View
                  style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.border }]}>
                  <Icon icon={Delete02Icon} size={22} themeColor="textSecondary" />
                  <ThemedText style={styles.settingLabel}>Force delete</ThemedText>
                  <View style={styles.switchSlot}>
                    <Switch
                      value={forceDelete}
                      onChange={setForceDelete}
                      accessibilityLabel="Force delete"
                    />
                  </View>
                </View>
                {/* A made-up loss of each kind: nothing is charged or emailed. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const preview = (args: Parameters<typeof devLose>[0]) => {
                      devLose(args)
                        .then(openLoss)
                        .catch((error: unknown) => console.error('Failed to preview', error));
                    };
                    Alert.alert('Preview a loss', undefined, [
                      {
                        text: 'Money, 23-day streak',
                        onPress: () => preview({ kind: 'money', subject: 'habit' }),
                      },
                      {
                        text: 'Money, broke on day 2',
                        onPress: () => preview({ kind: 'money', subject: 'habit', streak: 1 }),
                      },
                      {
                        text: 'Money, a goal',
                        onPress: () => preview({ kind: 'money', subject: 'goal' }),
                      },
                      {
                        text: 'Money, card declined',
                        onPress: () => preview({ kind: 'money', subject: 'habit', declined: true }),
                      },
                      {
                        text: 'A friend was told',
                        onPress: () => preview({ kind: 'friend', subject: 'habit' }),
                      },
                      {
                        text: 'Lockout',
                        onPress: () => preview({ kind: 'lockout', subject: 'habit' }),
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                  style={({ pressed }) => [
                    styles.settingRow,
                    { borderTopWidth: 1, borderTopColor: theme.border },
                    pressed && styles.pressed,
                  ]}>
                  <Icon icon={CoinsDollarIcon} size={22} themeColor="textSecondary" />
                  <ThemedText style={styles.settingLabel}>Preview a loss</ThemedText>
                </Pressable>
                {/* A made-up first miss let go: nothing is charged or emailed. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const preview = (args: Parameters<typeof devGrace>[0]) => {
                      devGrace(args)
                        .then(openGrace)
                        .catch((error: unknown) => console.error('Failed to preview', error));
                    };
                    Alert.alert('Preview a first miss', undefined, [
                      {
                        text: 'Habit, money waived',
                        onPress: () => preview({ kind: 'money', subject: 'habit' }),
                      },
                      {
                        text: 'Habit, friend waived',
                        onPress: () => preview({ kind: 'friend', subject: 'habit' }),
                      },
                      {
                        text: 'Habit, lockout waived',
                        onPress: () => preview({ kind: 'lockout', subject: 'habit' }),
                      },
                      {
                        text: 'Goal, deadline extended',
                        onPress: () => preview({ kind: 'money', subject: 'goal' }),
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                  style={({ pressed }) => [
                    styles.settingRow,
                    { borderTopWidth: 1, borderTopColor: theme.border },
                    pressed && styles.pressed,
                  ]}>
                  <Icon icon={CoinsDollarIcon} size={22} themeColor="textSecondary" />
                  <ThemedText style={styles.settingLabel}>Preview a first miss</ThemedText>
                </Pressable>
                {/* A made-up accomplishment: nothing real changes. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const preview = (args: Parameters<typeof devKept>[0]) => {
                      devKept(args)
                        .then(openKept)
                        .catch((error: unknown) => console.error('Failed to preview', error));
                    };
                    Alert.alert('Preview kept', undefined, [
                      {
                        text: 'A daily habit, 34 days',
                        onPress: () => preview({ subject: 'habit' }),
                      },
                      {
                        text: 'A weekly habit, 6 weeks',
                        onPress: () => preview({ subject: 'habit', weekly: true }),
                      },
                      { text: 'A goal', onPress: () => preview({ subject: 'goal' }) },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                  style={({ pressed }) => [
                    styles.settingRow,
                    { borderTopWidth: 1, borderTopColor: theme.border },
                    pressed && styles.pressed,
                  ]}>
                  <Icon icon={Flag02Icon} size={22} themeColor="textSecondary" />
                  <ThemedText style={styles.settingLabel}>Preview kept</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    (freeze != null ? devLift() : devFreeze({ days: 3 })).catch(
                      (error: unknown) => {
                        console.error('Failed to change the freeze', error);
                      },
                    );
                  }}
                  style={({ pressed }) => [
                    styles.settingRow,
                    { borderTopWidth: 1, borderTopColor: theme.border },
                    pressed && styles.pressed,
                  ]}>
                  <Icon icon={LockKeyholeIcon} size={22} themeColor="textSecondary" />
                  <ThemedText style={styles.settingLabel}>
                    {freeze != null ? 'Lift the freeze' : 'Freeze my habits for 3 days'}
                  </ThemedText>
                </Pressable>
                {/* Pro without the App Store, or its end, to test both sides of the paywall. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    (isPro ? devEndPro() : devGrantPro()).catch((error: unknown) => {
                      console.error('Failed to change Pro', error);
                    });
                  }}
                  style={({ pressed }) => [
                    styles.settingRow,
                    { borderTopWidth: 1, borderTopColor: theme.border },
                    pressed && styles.pressed,
                  ]}>
                  <Icon icon={SparklesIcon} size={22} themeColor="textSecondary" />
                  <ThemedText style={styles.settingLabel}>
                    {isPro ? 'End Pro now' : 'Grant Pro for 30 days'}
                  </ThemedText>
                </Pressable>
                {/* The once-a-day paywall again, on the next launch or return to the app. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={resetDailyPaywall}
                  style={({ pressed }) => [
                    styles.settingRow,
                    { borderTopWidth: 1, borderTopColor: theme.border },
                    pressed && styles.pressed,
                  ]}>
                  <Icon icon={SparklesIcon} size={22} themeColor="textSecondary" />
                  <ThemedText style={styles.settingLabel}>Reset the daily paywall</ThemedText>
                </Pressable>
                {/* The trial-ending push, now, rather than days out. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    devPreviewNotices().catch((error: unknown) => {
                      console.error('Failed to send account notices', error);
                    });
                  }}
                  style={({ pressed }) => [
                    styles.settingRow,
                    { borderTopWidth: 1, borderTopColor: theme.border },
                    pressed && styles.pressed,
                  ]}>
                  <Icon icon={Notification01Icon} size={22} themeColor="textSecondary" />
                  <ThemedText style={styles.settingLabel}>Send account notices</ThemedText>
                </Pressable>
              </>
            ) : null}
          </ThemedView>
        </View>
      ) : null}

      <View style={styles.footer}>
        <AnteWordmark height={18} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.buildInfo}>
          {describeBuild()}
        </ThemedText>
      </View>
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
    flex: 1,
    gap: Spacing.half,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  displayName: {
    ...ScreenHeadingTypography,
    flexShrink: 1,
  },
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
  // One text line tall: the switch overhangs it slightly instead of making its
  // row taller than the others.
  switchSlot: {
    height: 24,
    justifyContent: 'center',
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
  footer: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  buildInfo: {
    textAlign: 'center',
  },
});
