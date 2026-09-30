import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Countdown } from './countdown';
import { EndingKicker } from './ending-kicker';
import { HabitActionButton } from './habit-action-button';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { commitmentIcon } from '@/constants/commitment-icons';
import { FlameIcon } from '@/constants/icons';
import { ActionCardRadius, ControlHeight, PillRadius, Spacing } from '@/constants/theme';
import { targetPerWeek } from '@/convex/lib/frequency';
import { endingStatus } from '@/data/ending';
import { isDaily, isWeekDone, type HabitWithProgress } from '@/data/habits';
import { stakeChip } from '@/data/stakes';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/dates';

export type HabitCardProps = {
  habit: HabitWithProgress;
  /** When set, the card counts down to it (urgent items). */
  deadlineAt?: number;
  /**
   * No Ante Pro: nothing is checked and nothing can be logged or restarted, so
   * the card greys out and trades its action for a lock.
   */
  paused?: boolean;
  /** A lockout froze every habit until then: nothing can be logged. */
  frozenUntil?: number;
};

export function HabitCard({ habit, deadlineAt, paused = false, frozenUntil }: HabitCardProps) {
  const theme = useTheme();

  const daily = isDaily(habit);
  const weekDone = isWeekDone(habit);
  const logged = habit.completedToday || weekDone;
  const ending = endingStatus(habit, todayKey());
  const broken = habit.brokenAt !== undefined;
  // A friend who opted out left the habit on the user's word until they pick someone.
  const friendGone = habit.stakeView?.kind === 'friend' && habit.stakeView.status === 'void';
  const chip = broken ? null : stakeChip(habit.stakeView);
  // Greyed out: done for now, or not counting at all without Pro.
  const muted = logged || paused;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${habit.title}`}
        onPress={() => router.push(`/habit/${habit._id}`)}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={[styles.habitIcon, { backgroundColor: theme.background }]}>
          <Icon
            icon={commitmentIcon(habit.icon, 'habit')}
            size={26}
            themeColor={muted ? 'textSecondary' : 'text'}
          />
        </View>

        <View style={styles.body}>
          {/* An urgent deadline wins the slot above the title; the notice then sits in the meta row. */}
          {deadlineAt !== undefined ? (
            <Countdown deadlineAt={deadlineAt} />
          ) : ending !== null ? (
            <EndingKicker ending={ending} quiet={muted} />
          ) : null}
          <ThemedText numberOfLines={1} themeColor={muted ? 'textSecondary' : 'text'}>
            {habit.title}
          </ThemedText>

          <View style={styles.metaRow}>
            {habit.streak > 0 ? (
              <View style={styles.streak}>
                <Icon
                  icon={FlameIcon}
                  size={16}
                  color={paused ? theme.textSecondary : theme.accent}
                  fill={paused ? theme.textSecondary : theme.accent}
                />
                <ThemedText
                  type="smallSemibold"
                  themeColor={muted ? 'textSecondary' : 'text'}
                  accessibilityLabel={`${habit.streak} ${daily ? 'day' : 'week'} streak`}>
                  {daily ? habit.streak : `${habit.streak}w`}
                </ThemedText>
              </View>
            ) : null}
            {broken ? (
              <ThemedText type="small" themeColor={paused ? 'textSecondary' : 'accent'}>
                Streak lost
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                {daily ? 'Daily' : `${habit.weekCount} of ${targetPerWeek(habit)} this week`}
              </ThemedText>
            )}
            {/* The goal card's pill, so a stake reads the same on either card. */}
            {chip === null ? null : (
              <View
                style={[
                  styles.stakePill,
                  { backgroundColor: paused ? theme.background : theme.accentElement },
                ]}>
                <ThemedText
                  type="smallSemibold"
                  themeColor={paused ? 'textSecondary' : 'accent'}
                  accessibilityLabel={`On the line: ${chip}`}>
                  {chip}
                </ThemedText>
              </View>
            )}
            {friendGone ? (
              <ThemedText type="small" themeColor="accent">
                Pick a new friend
              </ThemedText>
            ) : null}
            {ending !== null && deadlineAt !== undefined ? (
              <ThemedText
                type="small"
                themeColor={ending.finished || muted ? 'textSecondary' : 'accent'}>
                {ending.label}
              </ThemedText>
            ) : null}
          </View>
        </View>
      </Pressable>

      <HabitActionButton
        habit={habit}
        paused={paused}
        frozenUntil={frozenUntil}
        style={styles.logAction}
      />
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
    width: ControlHeight,
    height: ControlHeight,
    borderRadius: ActionCardRadius - Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  // Wraps like the goal card's: the pill drops to its own line beside a wide button.
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stakePill: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: PillRadius,
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
