import { StyleSheet, View, type ViewStyle } from 'react-native';

import { dayDotStyle, weekBarStyle, weekFillColor } from '@/components/habit-history-strip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardRadius, Spacing } from '@/constants/theme';
import type { HabitDetailHistory } from '@/convex/habitHistory';
import { nextDay, weekEnd } from '@/convex/lib/days';
import { useTheme } from '@/hooks/use-theme';
import { fromDayKey } from '@/lib/dates';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DOT = 16;
const RING_GAP = 2;
const RING_WIDTH = 1.5;
const RING = DOT + 2 * (RING_GAP + RING_WIDTH);
const BAR_HEIGHT = 56;

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export type HabitCalendarProps = {
  history: HabitDetailHistory;
  today: string;
  /** Logs a week needs, for a weekly habit's bars. */
  target: number;
};

/**
 * How the habit has gone lately: five weeks of days under their weekday
 * letters for a daily habit, or twelve weeks of bars for a weekly one, each
 * filled toward its target. A legend underneath says what the marks mean.
 */
export function HabitCalendar({ history, today, target }: HabitCalendarProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {history.days.length > 0 ? (
        <DayGrid days={history.days} today={today} />
      ) : (
        <WeekBars weeks={history.weeks} target={target} />
      )}
    </ThemedView>
  );
}

function DayGrid({ days, today }: { days: HabitDetailHistory['days']; today: string }) {
  const theme = useTheme();
  // Pad to Sunday, so this week's row is whole; days to come stay blank.
  const upcoming = [];
  for (let day = nextDay(today); day <= weekEnd(today); day = nextDay(day)) {
    upcoming.push({ day, state: null });
  }
  const cells: { day: string; state: HabitDetailHistory['days'][number]['state'] | null }[] = [
    ...days,
    ...upcoming,
  ];
  const weeks = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));

  return (
    <View style={styles.grid}>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((letter, index) => (
          <ThemedText key={index} type="small" themeColor="textSecondary" style={styles.weekday}>
            {letter}
          </ThemedText>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].day} style={styles.weekRow}>
          {week.map(({ day, state }) => (
            <View key={day} style={styles.cell}>
              <View
                accessible={state !== null}
                accessibilityLabel={
                  state === null
                    ? undefined
                    : `${shortDate.format(fromDayKey(day))}: ${DAY_WORDS[state]}`
                }
                style={[styles.ring, day === today && { borderColor: theme.text }]}>
                <View
                  style={[
                    styles.dot,
                    state === null
                      ? { borderWidth: 1, borderColor: theme.border, opacity: 0.5 }
                      : dayDotStyle(state, theme),
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      ))}
      <Legend
        items={[
          { label: 'Done', style: dayDotStyle('done', theme) },
          { label: 'Missed', style: dayDotStyle('missed', theme) },
          { label: 'Frozen', style: dayDotStyle('frozen', theme) },
          { label: 'Not counted', style: dayDotStyle('off', theme) },
        ]}
      />
    </View>
  );
}

const DAY_WORDS: Record<HabitDetailHistory['days'][number]['state'], string> = {
  done: 'done',
  missed: 'missed',
  excused: 'excused, our error',
  frozen: 'frozen',
  pending: 'being checked',
  open: 'not logged yet',
  off: 'not counted',
};

function WeekBars({ weeks, target }: { weeks: HabitDetailHistory['weeks']; target: number }) {
  const theme = useTheme();
  const first = weeks[0]?.weekStart;

  return (
    <View style={styles.grid}>
      <View style={styles.bars}>
        {weeks.map(({ weekStart, count, state }) => (
          <View
            key={weekStart}
            accessible
            accessibilityLabel={`Week of ${shortDate.format(fromDayKey(weekStart))}: ${count} of ${target}`}
            style={styles.barColumn}>
            <View style={[styles.bar, weekBarStyle(state, theme)]}>
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
            <ThemedText type="small" themeColor="textSecondary" style={styles.barCount}>
              {state === 'off' ? '' : count}
            </ThemedText>
          </View>
        ))}
      </View>
      <View style={styles.barLabels}>
        <ThemedText type="small" themeColor="textSecondary">
          {first === undefined ? '' : shortDate.format(fromDayKey(first))}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          This week
        </ThemedText>
      </View>
      <Legend
        items={[
          { label: `Hit ${target}`, style: { backgroundColor: theme.accent } },
          { label: 'Short', style: { backgroundColor: weekFillColor('short', theme) } },
          { label: 'Frozen', style: weekBarStyle('frozen', theme) },
        ]}
      />
    </View>
  );
}

function Legend({ items }: { items: { label: string; style: ViewStyle }[] }) {
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no">
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendDot, item.style]} />
          <ThemedText type="small" themeColor="textSecondary">
            {item.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CardRadius,
    padding: Spacing.three,
  },
  grid: {
    gap: Spacing.two,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
  },
  cell: {
    flex: 1,
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
    flexDirection: 'row',
    gap: Spacing.one,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  bar: {
    width: '100%',
    height: BAR_HEIGHT,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: {
    width: '100%',
  },
  barCount: {
    fontVariant: ['tabular-nums'],
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
    paddingTop: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
