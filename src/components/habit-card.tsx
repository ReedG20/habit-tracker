import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { Countdown } from './countdown';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { FlameIcon, HabitIcon } from '@/constants/icons';
import { ActionCardRadius, ButtonHeight, Spacing } from '@/constants/theme';
import type { HabitWithProgress } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';

export type HabitCardProps = {
  habit: HabitWithProgress;
  /** When set, the card counts down to it (urgent items). */
  deadlineAt?: number;
};

export function HabitCard({ habit, deadlineAt }: HabitCardProps) {
  const theme = useTheme();

  const logged = habit.completedToday;
  const verifying = !logged && habit.verification?.status === 'pending';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${habit.title}`}
        onPress={() => router.push(`/habit/${habit._id}`)}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={[styles.habitIcon, { backgroundColor: theme.background }]}>
          <Icon icon={HabitIcon} size={26} themeColor={logged ? 'textSecondary' : 'text'} />
        </View>

        <View style={styles.body}>
          {deadlineAt !== undefined ? <Countdown deadlineAt={deadlineAt} /> : null}
          <ThemedText numberOfLines={1} themeColor={logged ? 'textSecondary' : 'text'}>
            {habit.title}
          </ThemedText>

          <View style={styles.metaRow}>
            {habit.streak > 0 ? (
              <View style={styles.streak}>
                <Icon icon={FlameIcon} size={16} color={theme.accent} fill={theme.accent} />
                <ThemedText type="smallSemibold" themeColor={logged ? 'textSecondary' : 'text'}>
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

      {logged ? (
        <ActionButton
          label="Logged"
          disabled
          onPress={() => {}}
          style={styles.logAction}
        />
      ) : verifying ? (
        <ActionButton
          label="Verifying…"
          accessibilityLabel={`Verifying ${habit.title}`}
          disabled
          onPress={() => {}}
          style={styles.logAction}
        />
      ) : (
        <ActionButton
          label="Log"
          accessibilityLabel={`Log ${habit.title}`}
          variant="primary"
          // `navigate` rather than `push`: a double tap must not stack two sheets.
          onPress={() => router.navigate(`/habit/${habit._id}/verify`)}
          style={styles.logAction}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.three,
    borderRadius: ActionCardRadius,
    padding: Spacing.three,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    minWidth: 0,
  },
  // Same height as the button opposite it, and concentric with the card's corner.
  habitIcon: {
    width: ButtonHeight,
    height: ButtonHeight,
    borderRadius: ActionCardRadius - Spacing.three,
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
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  logAction: {
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.7,
  },
});
