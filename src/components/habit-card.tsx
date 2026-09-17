import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { HabitIcons } from '@/constants/habit-icons';
import { CheckmarkCircle02Icon, Fire02Icon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { Verifications, type Habit } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';

export function HabitCard({ habit }: { habit: Habit }) {
  const theme = useTheme();
  const verification = Verifications[habit.verification];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.habitIcon, { backgroundColor: theme.background }]}>
          <Icon icon={HabitIcons[habit.iconKey]} size={22} />
        </View>

        <View style={styles.headerText}>
          <ThemedText numberOfLines={1}>{habit.title}</ThemedText>

          <View style={styles.metaRow}>
            <Icon icon={verification.icon} size={14} themeColor="textSecondary" />
            <ThemedText type="small" themeColor="textSecondary">
              {verification.label}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ·
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {habit.frequency}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.streakPill, { backgroundColor: theme.accentElement }]}>
          <Icon icon={Fire02Icon} size={14} themeColor="accent" />
          <ThemedText type="smallBold" themeColor="accent">
            {habit.streak}
          </ThemedText>
        </View>
      </View>

      {/* TODO: kick off the real verification + logging flow */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Log ${habit.title}`}
        style={({ pressed }) => [
          styles.logButton,
          { backgroundColor: theme.text },
          pressed && styles.pressed,
        ]}>
        <Icon icon={CheckmarkCircle02Icon} size={18} color={theme.background} />
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          Log
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  habitIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
  },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
