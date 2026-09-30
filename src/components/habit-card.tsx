import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { Countdown } from './countdown';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { FlameIcon, HabitIcon, LockKeyholeIcon } from '@/constants/icons';
import { PROOF_METHODS, proofMethodOf, proveLabel } from '@/constants/proof-methods';
import { ActionCardRadius, ControlHeight, Spacing } from '@/constants/theme';
import { targetPerWeek } from '@/convex/lib/frequency';
import { describeEnding, isDaily, isWeekDone, type HabitWithProgress } from '@/data/habits';
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

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

export function HabitCard({ habit, deadlineAt, paused = false, frozenUntil }: HabitCardProps) {
  const theme = useTheme();

  const daily = isDaily(habit);
  const weekDone = isWeekDone(habit);
  const logged = habit.completedToday || weekDone;
  const verifying = !logged && habit.verification?.status === 'pending';
  const ending = describeEnding(habit, todayKey());
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
          <Icon icon={HabitIcon} size={26} themeColor={muted ? 'textSecondary' : 'text'} />
        </View>

        <View style={styles.body}>
          {deadlineAt !== undefined ? <Countdown deadlineAt={deadlineAt} /> : null}
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
            {chip === null ? null : (
              <ThemedText
                type="smallSemibold"
                themeColor={paused ? 'textSecondary' : 'accent'}
                accessibilityLabel={`On the line: ${chip}`}>
                {chip}
              </ThemedText>
            )}
            {friendGone ? (
              <ThemedText type="small" themeColor="accent">
                Pick a new friend
              </ThemedText>
            ) : null}
            {ending === null ? null : (
              <ThemedText type="small" themeColor="accent">
                {ending}
              </ThemedText>
            )}
          </View>
        </View>
      </Pressable>

      {paused ? (
        // Ahead of Restart and Frozen: neither can happen without Pro. Just a
        // quiet lock; the section above offers the way back, once.
        <View
          accessible
          accessibilityLabel={`${habit.title} is paused until Ante Pro is back`}
          style={styles.pausedLock}>
          <Icon icon={LockKeyholeIcon} size={20} strokeWidth={2} themeColor="textSecondary" />
        </View>
      ) : broken ? (
        <ActionButton
          label="Restart"
          accessibilityLabel={`Restart ${habit.title}`}
          variant="primary"
          onPress={() => router.navigate(`/restart/${habit._id}`)}
          style={styles.logAction}
        />
      ) : frozenUntil !== undefined && !logged ? (
        <ActionButton
          label={`Frozen till ${weekday.format(new Date(frozenUntil + 60 * 60 * 1000))}`}
          accessibilityLabel={`${habit.title} is frozen`}
          disabled
          onPress={() => {}}
          style={styles.logAction}
        />
      ) : weekDone ? (
        <ActionButton label="Done this week" disabled onPress={() => {}} style={styles.logAction} />
      ) : logged ? (
        <ActionButton label="Logged" disabled onPress={() => {}} style={styles.logAction} />
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
          label={PROOF_METHODS[proofMethodOf(habit)].verb}
          icon={PROOF_METHODS[proofMethodOf(habit)].icon}
          accessibilityLabel={proveLabel(habit)}
          variant="primary"
          // `navigate` rather than `push`: a double tap must not open it twice.
          onPress={() => router.navigate(`/habit/${habit._id}/prove`)}
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
  pausedLock: {
    width: ControlHeight,
    height: ControlHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
