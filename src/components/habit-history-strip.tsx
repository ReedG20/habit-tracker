import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { HabitHistory, HistoryDayState, HistoryWeekState } from '@/convex/habitHistory';
import { useTheme } from '@/hooks/use-theme';

const DOT = 12;
const RING_GAP = 1.5;
const RING_WIDTH = 1.5;
/** A dot with room for today's ring around it. */
const RING = DOT + 2 * (RING_GAP + RING_WIDTH);
const BAR_HEIGHT = 20;

const DAY_LABELS: Record<HistoryDayState, string> = {
  done: 'done',
  missed: 'missed',
  excused: 'excused',
  frozen: 'frozen',
  pending: 'checking',
  open: 'still open',
  off: 'not counted',
};

type Theme = ReturnType<typeof useTheme>;

/** A day's dot, colored like the Me screen's calendar. */
export function dayDotStyle(state: HistoryDayState, theme: Theme): ViewStyle {
  switch (state) {
    case 'done':
      return { backgroundColor: theme.accent };
    case 'pending':
      // ~35% of the accent.
      return { backgroundColor: `${theme.accent}59` };
    case 'missed':
      // ~40% of the secondary text: plain, but clearly there.
      return { backgroundColor: `${theme.textSecondary}66` };
    case 'frozen':
      return { borderWidth: 2, borderColor: theme.primary };
    case 'excused':
    case 'open':
      return { borderWidth: 1, borderColor: theme.textSecondary };
    case 'off':
      // A speck: nothing was owed that day.
      return { backgroundColor: theme.border, transform: [{ scale: 0.4 }] };
  }
}

/** A week's bar, before its fill. */
export function weekBarStyle(state: HistoryWeekState, theme: Theme): ViewStyle {
  switch (state) {
    case 'met':
    case 'short':
      return { backgroundColor: theme.backgroundSelected };
    case 'open':
      return { borderWidth: 1, borderColor: theme.text };
    case 'frozen':
      return { borderWidth: 2, borderColor: theme.primary };
    case 'off':
      return { backgroundColor: theme.backgroundSelected, opacity: 0.35 };
  }
}

/** A week's fill: solid once it hit the target, faint while short of it. */
export function weekFillColor(state: HistoryWeekState, theme: Theme): string {
  return state === 'met' ? theme.accent : `${theme.accent}59`;
}

export type HabitHistoryStripProps = {
  history: HabitHistory;
  /** Logs a week needs, for a weekly habit's bars. */
  target: number;
};

/**
 * A habit's recent run in one line: two weeks of dots for a daily habit, eight
 * weeks of bars for a weekly one. Colored like the Me screen's calendar.
 */
export function HabitHistoryStrip({ history, target }: HabitHistoryStripProps) {
  if (history.days.length > 0) return <DayStrip days={history.days} />;
  return <WeekStrip weeks={history.weeks} target={target} />;
}

function DayStrip({ days }: { days: HabitHistory['days'] }) {
  const theme = useTheme();
  const done = days.filter((entry) => entry.state === 'done').length;
  const missed = days.filter((entry) => entry.state === 'missed').length;

  return (
    <View
      accessible
      accessibilityLabel={`Last ${days.length} days: ${done} done, ${missed} missed`}
      style={styles.row}>
      {days.map(({ day, state }, index) => {
        const today = index === days.length - 1;
        return (
          <View
            key={day}
            accessibilityLabel={`${day}: ${DAY_LABELS[state]}`}
            style={[styles.ring, today && { borderColor: theme.text }]}>
            <View style={[styles.dot, dayDotStyle(state, theme)]} />
          </View>
        );
      })}
    </View>
  );
}

function WeekStrip({ weeks, target }: { weeks: HabitHistory['weeks']; target: number }) {
  const theme = useTheme();
  const met = weeks.filter((week) => week.state === 'met').length;
  const short = weeks.filter((week) => week.state === 'short').length;

  return (
    <View
      accessible
      accessibilityLabel={`Last ${weeks.length} weeks: ${met} hit the target, ${short} fell short`}
      style={[styles.row, styles.bars]}>
      {weeks.map(({ weekStart, count, state }) => (
        <View key={weekStart} style={[styles.bar, weekBarStyle(state, theme)]}>
          {count > 0 && state !== 'off' ? (
            <View
              style={[
                styles.fill,
                {
                  height: `${Math.min(1, count / target) * 100}%`,
                  backgroundColor: weekFillColor(state, theme),
                },
              ]}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Always there, so today's ring doesn't shift its dot.
  ring: {
    width: RING,
    height: RING,
    padding: RING_GAP,
    borderRadius: RING / 2,
    borderWidth: RING_WIDTH,
    borderColor: 'transparent',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  bars: {
    gap: Spacing.one,
  },
  bar: {
    flex: 1,
    height: BAR_HEIGHT,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: {
    width: '100%',
  },
});
