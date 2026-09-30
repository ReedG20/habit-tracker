import { StyleSheet, View } from 'react-native';

import { GoalActionButton } from '@/components/goal-action-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionCardRadius, PillRadius, Spacing } from '@/constants/theme';
import { isMissed, type GoalWithStatus } from '@/data/goals';
import { useTheme } from '@/hooks/use-theme';
import { describeTimeLeft, formatShortDate } from '@/lib/dates';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Where the goal stands: time left and how much of the runway is used up,
 * drawn as a line from the day it was set to its deadline, then Submit.
 */
export function GoalNowPanel({ goal, now }: { goal: GoalWithStatus; now: number }) {
  const theme = useTheme();
  const done = goal.completedAt !== undefined;
  const missed = isMissed(goal, now);
  const verifying = !done && !missed && goal.submission?.status === 'pending';
  const rejected = !done && !missed && goal.submission?.status === 'rejected';

  const start = goal._creationTime;
  const end = done ? (goal.completedAt ?? now) : now;
  const used = Math.min(1, Math.max(0, (end - start) / Math.max(1, goal.dueAt - start)));

  let headline: string;
  let note: string;
  if (done) {
    const early = Math.floor((goal.dueAt - (goal.completedAt ?? now)) / DAY);
    headline = 'Done';
    note =
      early > 0
        ? `Finished ${formatShortDate(goal.completedAt ?? now)}, ${early} day${early === 1 ? '' : 's'} early.`
        : `Finished ${formatShortDate(goal.completedAt ?? now)}.`;
  } else if (missed) {
    headline = 'Missed';
    note = 'The deadline passed without accepted proof.';
  } else if (verifying) {
    headline = 'Checking your proof…';
    note = `${describeTimeLeft(goal.dueAt, now)}. This usually takes a few seconds.`;
  } else {
    headline = describeTimeLeft(goal.dueAt, now);
    note = rejected
      ? 'Your last proof didn’t count. Try again before the deadline.'
      : 'Submit proof any time before the deadline.';
  }

  return (
    <ThemedView type="backgroundElement" style={styles.panel}>
      <View style={styles.text} accessible accessibilityRole="summary">
        <ThemedText style={styles.headline} themeColor={missed || rejected ? 'accent' : 'text'}>
          {headline}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      </View>

      <View style={styles.runway} accessibilityElementsHidden importantForAccessibility="no">
        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
          <View
            style={[
              styles.used,
              {
                width: `${used * 100}%`,
                backgroundColor: done ? theme.accent : missed ? theme.textSecondary : theme.primary,
              },
            ]}
          />
        </View>
        <View style={styles.ends}>
          <ThemedText type="small" themeColor="textSecondary">
            Set {formatShortDate(start)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Due {formatShortDate(goal.dueAt)}
          </ThemedText>
        </View>
      </View>

      {/* Nothing to do once it's over or being checked: the headline says so. */}
      {done || missed || verifying ? null : <GoalActionButton goal={goal} now={now} fill />}
    </ThemedView>
  );
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
  runway: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  track: {
    height: 8,
    borderRadius: PillRadius,
    overflow: 'hidden',
  },
  used: {
    height: '100%',
    borderRadius: PillRadius,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
