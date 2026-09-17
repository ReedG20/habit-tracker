import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { FlameIcon, HabitIcon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { HabitWithProgress } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';

const STREAK_RED = '#FF6344';
const STREAK_ON_RED = '#ffffff';

export type HabitCardProps = {
  habit: HabitWithProgress;
  /** Passed down rather than recomputed so the card and the query agree on the day. */
  today: string;
};

export function HabitCard({ habit, today }: HabitCardProps) {
  const theme = useTheme();
  const toggleCompletion = useMutation(api.habits.toggleCompletion);

  const logged = habit.completedToday;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${habit.title}`}
        onPress={() => router.push(`/habit/${habit._id}`)}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={[styles.habitIcon, { backgroundColor: theme.background }]}>
          <Icon
            icon={HabitIcon}
            size={22}
            themeColor={logged ? 'textSecondary' : 'text'}
          />
        </View>

        <View style={styles.body}>
          <ThemedText numberOfLines={1} themeColor={logged ? 'textSecondary' : 'text'}>
            {habit.title}
          </ThemedText>

          <View style={styles.metaRow}>
            {habit.streak > 0 ? (
              <View style={styles.streakPill}>
                <Icon icon={FlameIcon} size={14} color={STREAK_ON_RED} />
                <ThemedText type="smallBold" style={{ color: STREAK_ON_RED }}>
                  {habit.streak}
                </ThemedText>
              </View>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              Daily
            </ThemedText>
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={logged ? `Un-log ${habit.title}` : `Log ${habit.title}`}
        onPress={() => {
          void toggleCompletion({ habitId: habit._id, day: today }).catch((error: unknown) => {
            console.error('Failed to toggle the habit completion', error);
          });
        }}
        style={({ pressed }) => [
          styles.logButton,
          logged
            ? { borderColor: theme.border, borderWidth: 1 }
            : { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}>
        <ThemedText
          type="smallBold"
          style={logged ? { color: theme.textSecondary } : { color: theme.onPrimary }}>
          {logged ? 'Logged' : 'Log'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.three,
    borderRadius: BorderRadius,
    padding: Spacing.three,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    minWidth: 0,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    minWidth: 72,
    borderRadius: BorderRadius,
  },
  pressed: {
    opacity: 0.7,
  },
});
