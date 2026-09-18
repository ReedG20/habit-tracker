import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { FlameIcon, HabitIcon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import type { HabitWithProgress } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';

const STREAK_RED = '#FF6344';
const STREAK_ON_RED = '#ffffff';

export type HabitCardProps = {
  habit: HabitWithProgress;
};

export function HabitCard({ habit }: HabitCardProps) {
  const theme = useTheme();

  const logged = habit.completedToday;
  const verifying = !logged && habit.verification?.status === 'pending';
  // A verdict the user still needs to act on; `list` already drops it once logged.
  const setback =
    !logged &&
    (habit.verification?.status === 'rejected' || habit.verification?.status === 'failed')
      ? habit.verification
      : null;

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

          {setback ? (
            <ThemedText type="small" numberOfLines={2} style={{ color: theme.accent }}>
              {setback.reason ?? 'Not verified. Try another photo.'}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>

      {logged ? (
        <View style={[styles.logButton, { borderColor: theme.border, borderWidth: 1 }]}>
          <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
            Logged
          </ThemedText>
        </View>
      ) : verifying ? (
        <View
          accessibilityLabel={`Verifying ${habit.title}`}
          style={[styles.logButton, styles.verifying, { borderColor: theme.border, borderWidth: 1 }]}>
          <ActivityIndicator size="small" color={theme.textSecondary} />
          <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
            Verifying
          </ThemedText>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Log ${habit.title}`}
          // `navigate` rather than `push`: a double tap must not stack two sheets.
          onPress={() => router.navigate(`/habit/${habit._id}/verify`)}
          style={({ pressed }) => [
            styles.logButton,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            Log
          </ThemedText>
        </Pressable>
      )}
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
  verifying: {
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
