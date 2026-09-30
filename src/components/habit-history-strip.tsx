import { StyleSheet, View, type ViewStyle } from 'react-native';

import { markStyle, type CalendarMark } from '@/components/calendar/calendar-marks';
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

/** A day's state as a calendar mark, so it's drawn like every other calendar. */
export function dayMark(state: HistoryDayState): CalendarMark {
  switch (state) {
    case 'done':
      return 'done';
    case 'pending':
      return 'partial';
    case 'missed':
      return 'missed';
    case 'frozen':
      return 'frozen';
    case 'excused':
    case 'open':
      return 'open';
    case 'off':
      return 'off';
  }
}

/** A week's bar, before its fill. */
export function weekBarStyle(state: HistoryWeekState, theme: Theme): ViewStyle {
  switch (state) {
    case 'met':
    case 'short':
      return { backgroundColor: theme.backgroundSelected };
    case 'open':
      return { borderWidth: 1, borderColor: theme.textSecondary };
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
 * weeks of bars for a weekly one. Marked like the calendars (see `calendar-marks`).
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
            <View style={[styles.dot, markStyle(dayMark(state), theme)]} />
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
