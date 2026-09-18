import { useClerk, useUser } from '@clerk/expo';
import type { IconSvgElement } from '@hugeicons/react-native';
import { useQuery } from 'convex/react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  ArrowRight01Icon,
  Logout01Icon,
  Notification01Icon,
  Settings02Icon,
  UserCircleIcon,
} from '@/constants/icons';
import {
  CardRadius,
  CardShadow,
  PillRadius,
  ScreenHeadingTypography,
  Spacing,
} from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { currentStreak } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/dates';

const settings: { id: string; label: string; icon: IconSvgElement }[] = [
  { id: 'reminders', label: 'Reminders', icon: Notification01Icon },
  { id: 'preferences', label: 'Preferences', icon: Settings02Icon },
];

function formatStreak(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

export default function MeScreen() {
  const theme = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();
  const habits = useQuery(api.habits.list, { today: todayKey() });
  const loggedCount = useQuery(api.habits.loggedCount);

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

      <ThemedView type="backgroundElement" style={styles.settingsGroup}>
        {settings.map((setting, index) => (
          <Pressable
            key={setting.id}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.settingRow,
              index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
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
  statRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  statTile: {
    flex: 1,
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.half,
    ...CardShadow,
  },
  settingsGroup: {
    borderRadius: CardRadius,
    overflow: 'hidden',
    ...CardShadow,
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
});
