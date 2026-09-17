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
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { useTheme } from '@/hooks/use-theme';

const stats = [
  { id: 'longest', label: 'Longest streak', value: '23 days' },
  { id: 'logged', label: 'Habits logged', value: '148' },
];

const settings: { id: string; label: string; icon: IconSvgElement }[] = [
  { id: 'reminders', label: 'Reminders', icon: Notification01Icon },
  { id: 'preferences', label: 'Preferences', icon: Settings02Icon },
];

export default function MeScreen() {
  const theme = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();
  const habits = useQuery(api.habits.list);

  const displayName =
    user?.firstName ?? user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'You';

  return (
    <ScreenScrollView>
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
          <Icon icon={UserCircleIcon} size={32} themeColor="textSecondary" />
        </View>
        <View style={styles.identityText}>
          <ThemedText type="subtitle">{displayName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {habits === undefined
              ? ' '
              : `${habits.length} active habit${habits.length === 1 ? '' : 's'}`}
          </ThemedText>
        </View>
      </View>

      <View style={styles.statRow}>
        {stats.map((stat) => (
          <ThemedView key={stat.id} type="backgroundElement" style={styles.statTile}>
            <ThemedText type="subtitle">{stat.value}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {stat.label}
            </ThemedText>
          </ThemedView>
        ))}
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
            <Icon icon={setting.icon} size={20} themeColor="textSecondary" />
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
          <Icon icon={Logout01Icon} size={20} themeColor="textSecondary" />
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
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    gap: Spacing.half,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  statTile: {
    flex: 1,
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  settingsGroup: {
    borderRadius: Spacing.four,
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
});
