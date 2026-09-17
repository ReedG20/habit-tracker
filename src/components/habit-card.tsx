import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { HabitIcons } from '@/constants/habit-icons';
import { FlameIcon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { Verifications, type Habit } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';

const STREAK_RED = '#FF6344';
const STREAK_ON_RED = '#ffffff';

export function HabitCard({ habit }: { habit: Habit }) {
  const theme = useTheme();
  const verification = Verifications[habit.verification];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={[styles.habitIcon, { backgroundColor: theme.background }]}>
        <Icon icon={HabitIcons[habit.iconKey]} size={22} />
      </View>

      <View style={styles.body}>
        <ThemedText numberOfLines={1}>{habit.title}</ThemedText>

        <View style={styles.metaRow}>
          <View style={styles.streakPill}>
            <Icon icon={FlameIcon} size={14} color={STREAK_ON_RED} />
            <ThemedText type="smallBold" style={{ color: STREAK_ON_RED }}>
              {habit.streak}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {habit.frequency}
          </ThemedText>
        </View>
      </View>

      {/* TODO: kick off the real verification + logging flow */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Log ${habit.title}`}
        style={({ pressed }) => [
          styles.logButton,
          { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}>
        <Icon icon={verification.icon} size={18} color={theme.onPrimary} />
        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
          Log
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    borderRadius: BorderRadius,
    padding: Spacing.three,
  },
  habitIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: BorderRadius,
    backgroundColor: STREAK_RED,
  },
  logButton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: BorderRadius,
  },
  pressed: {
    opacity: 0.7,
  },
});
