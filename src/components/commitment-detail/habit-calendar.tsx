import { StyleSheet, View } from 'react-native';

import { CalendarDay, CalendarWeekdays } from '@/components/calendar/calendar-day';
import { CalendarHeader } from '@/components/calendar/calendar-header';
import { CalendarLegend } from '@/components/calendar/calendar-legend';
import { markStyle, type CalendarMark } from '@/components/calendar/calendar-marks';
import { dayMark, weekBarStyle, weekFillColor } from '@/components/habit-history-strip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardRadius, Spacing } from '@/constants/theme';
import type { HabitDetailHistory } from '@/convex/habitHistory';
import { nextDay, weekEnd } from '@/convex/lib/days';
import { useTheme } from '@/hooks/use-theme';
import { fromDayKey } from '@/lib/dates';

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
 * filled toward its target. Drawn like the Me screen's calendar, with a legend
 * underneath saying what the marks mean.
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

type Day = HabitDetailHistory['days'][number];

function DayGrid({ days, today }: { days: Day[]; today: string }) {
  const theme = useTheme();
  // A daily habit's grid is a plain Monday-first calendar. Pad to Sunday, so
  // this week's row is whole; days to come stay blank.
  const cells: { day: string; mark: CalendarMark; state?: Day['state'] }[] = days.map(
    ({ day, state }) => ({ day, mark: dayMark(state), state }),
  );
  for (let day = nextDay(today); day <= weekEnd(today, 0); day = nextDay(day)) {
    cells.push({ day, mark: 'future' });
  }
  const weeks = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));

  // Counted like the Me screen's: today only once it's done.
  const judged = days.filter(
    ({ day, state }) =>
      (state === 'done' || state === 'missed') && (day !== today || state === 'done'),
  );
  const kept = judged.filter(({ state }) => state === 'done').length;

  return (
    <View style={styles.body}>
      <CalendarHeader
        title={`Last ${weeks.length} weeks`}
        summary={judged.length === 0 ? undefined : `${kept} of ${judged.length} days`}
      />
      <CalendarWeekdays />
      <View style={styles.grid}>
        {weeks.map((week) => (
          <View key={week[0].day} style={styles.week}>
            {week.map(({ day, mark, state }) => (
              <CalendarDay
                key={day}
                mark={mark}
                today={day === today}
                accessibilityLabel={
                  state === undefined
                    ? undefined
                    : `${shortDate.format(fromDayKey(day))}${day === today ? ', today' : ''}: ${DAY_WORDS[state]}`
                }
              />
            ))}
          </View>
        ))}
      </View>
      <CalendarLegend
        items={[
          { label: 'Done', style: markStyle('done', theme) },
          { label: 'Missed', style: markStyle('missed', theme) },
          { label: 'Frozen', style: markStyle('frozen', theme) },
          { label: 'Not counted', style: markStyle('off', theme) },
        ]}
      />
    </View>
  );
}

const DAY_WORDS: Record<Day['state'], string> = {
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
  // This week only counts once it's met, as a day does.
  const judged = weeks.filter(({ state }) => state === 'met' || state === 'short');
  const met = judged.filter(({ state }) => state === 'met').length;

  return (
    <View style={styles.body}>
      <CalendarHeader
        title={`Last ${weeks.length} weeks`}
        summary={judged.length === 0 ? undefined : `${met} of ${judged.length} hit`}
      />
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
      <CalendarLegend
        items={[
          { label: `Hit ${target}`, style: markStyle('done', theme) },
          { label: 'Short', style: markStyle('partial', theme) },
          { label: 'Frozen', style: markStyle('frozen', theme) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CardRadius,
    padding: Spacing.three,
  },
  body: {
    gap: Spacing.two,
  },
  grid: {
    gap: Spacing.two,
  },
  week: {
    flexDirection: 'row',
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
});
