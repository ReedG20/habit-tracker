import { StyleSheet, View } from 'react-native';

import { HabitActionButton } from '@/components/habit-action-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionCardRadius, Spacing } from '@/constants/theme';
import { daysLeftInWeek } from '@/convex/lib/days';
import { targetPerWeek } from '@/convex/lib/frequency';
import { endingStatus } from '@/data/ending';
import { isDaily, isWeekDone, mustLogToday, type HabitWithProgress } from '@/data/habits';
import { describeCountdown, endOfDay } from '@/lib/dates';

export type HabitNowPanelProps = {
  habit: HabitWithProgress;
  today: string;
  now: number;
  paused: boolean;
  frozenUntil?: number;
  /** Today (or this week) doesn't count yet: the habit is new or just restarted. */
  free?: boolean;
};

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

/** Where the habit stands right now, and the one thing to do about it. */
export function HabitNowPanel({
  habit,
  today,
  now,
  paused,
  frozenUntil,
  free = false,
}: HabitNowPanelProps) {
  const { headline, note, urgent } = describeNow(habit, today, now, paused, frozenUntil, free);
  // Nothing to do: the headline already says why, so no greyed-out button.
  const idle =
    habit.brokenAt === undefined &&
    (habit.completedToday ||
      isWeekDone(habit) ||
      frozenUntil !== undefined ||
      (!paused && habit.verification?.status === 'pending'));

  return (
    <ThemedView type="backgroundElement" style={styles.panel}>
      <View style={styles.text} accessible accessibilityRole="summary">
        <ThemedText style={styles.headline} themeColor={urgent ? 'accent' : 'text'}>
          {headline}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      </View>
      {idle ? null : (
        <HabitActionButton habit={habit} paused={paused} frozenUntil={frozenUntil} fill />
      )}
    </ThemedView>
  );
}

function describeNow(
  habit: HabitWithProgress,
  today: string,
  now: number,
  paused: boolean,
  frozenUntil: number | undefined,
  free: boolean,
): { headline: string; note: string; urgent?: boolean } {
  const daily = isDaily(habit);
  const target = targetPerWeek(habit);
  const left = target - habit.weekCount;
  const tonight = describeCountdown(endOfDay(today), now);

  if (habit.brokenAt !== undefined) {
    return {
      headline: 'Streak lost',
      note: 'Its stake came due. Restart it to put something back on the line.',
      urgent: true,
    };
  }
  if (frozenUntil !== undefined && !habit.completedToday) {
    return {
      headline: 'Frozen',
      note: `Every habit is frozen until ${weekday.format(new Date(frozenUntil + 60 * 60 * 1000))}. Nothing counts against you till then.`,
    };
  }
  // Its last log is in: no "tomorrow" or "Monday" to point to. The ending
  // banner above says when it wraps up.
  if (endingStatus(habit, today)?.finished === true) {
    return daily
      ? { headline: 'Done for today', note: 'That was its last day.' }
      : { headline: 'Done for the week', note: 'That was its last week.' };
  }
  if (isWeekDone(habit)) {
    return {
      headline: 'Done for the week',
      note: `${target} of ${target}. It starts again Monday.`,
    };
  }
  if (habit.completedToday) {
    return daily
      ? { headline: 'Done for today', note: 'Back again tomorrow.' }
      : {
          headline: 'Logged today',
          note: `${habit.weekCount} of ${target} this week, ${left} to go.`,
        };
  }
  if (paused) {
    return {
      headline: 'Paused',
      note: 'Ante Pro has ended, so nothing is being checked or charged.',
    };
  }
  if (habit.verification?.status === 'pending') {
    return { headline: 'Checking your proof…', note: 'This usually takes a few seconds.' };
  }
  if (free) {
    return daily
      ? {
          headline: 'Free today',
          note: 'Its first day doesn’t count. Log it anyway to get going.',
        }
      : {
          headline: 'Free this week',
          note: 'It counts from Monday. Log it anyway to get going.',
        };
  }
  if (daily) {
    return {
      headline: 'Not done yet today',
      note: tonight === null ? 'Due by midnight.' : `Due by midnight, ${tonight}.`,
      urgent: habit.verification?.status === 'rejected',
    };
  }
  const days = daysLeftInWeek(today);
  return {
    headline: `${left} more this week`,
    note: mustLogToday(habit, today)
      ? `No slack left: it has to be today${tonight === null ? '' : `, ${tonight}`}.`
      : `${habit.weekCount} of ${target} so far, with ${days} day${days === 1 ? '' : 's'} left.`,
    urgent: mustLogToday(habit, today),
  };
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: ActionCardRadius,
    padding: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  text: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  headline: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
});
