import { useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CalendarDay, CalendarWeekdays } from '@/components/calendar/calendar-day';
import { CalendarHeader } from '@/components/calendar/calendar-header';
import type { CalendarMark } from '@/components/calendar/calendar-marks';
import { Icon } from '@/components/icon';
import { ThemedView } from '@/components/themed-view';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { CalendarDayState } from '@/convex/calendar';
import { dayOfWeek, daysBefore, daysBetween } from '@/convex/lib/days';
import { fromDayKey, todayKey } from '@/lib/dates';

const STATE_LABELS: Record<CalendarDayState, string> = {
  full: 'all done',
  partial: 'some done',
  missed: 'missed',
  frozen: 'frozen',
  none: 'nothing due',
};

const MARKS: Record<CalendarDayState, CalendarMark> = {
  full: 'done',
  partial: 'partial',
  missed: 'missed',
  frozen: 'frozen',
  none: 'off',
};

/** `YYYY-MM`, `delta` months from `month`. */
function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Every day of `month`, padded with `null` to whole Monday-to-Sunday weeks. */
function monthWeeks(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const last = daysBefore(`${shiftMonth(month, 1)}-01`, 1);
  const cells: (string | null)[] = [
    ...Array<null>(dayOfWeek(first)).fill(null),
    ...daysBetween(first, last),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}

const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long' });
const monthYearFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayLabelFormat = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' });

/**
 * A month of days, each dot showing how much of that day got done. Chevrons
 * step through months; swiping is left to the pager this sits in.
 */
export function ProgressCalendar() {
  const today = todayKey();
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const data = useQuery(api.calendar.month, { month, today });

  const states = new Map(data?.days.map(({ day, state }) => [day, state]));
  // Today only counts once it's done: until then it can't be held against you.
  const judged =
    data?.days.filter(
      ({ day, state }) =>
        state !== 'none' && state !== 'frozen' && (day !== today || state === 'full'),
    ) ?? [];
  const fullDays = judged.filter(({ state }) => state === 'full').length;

  const canGoBack = data !== undefined && data.firstDay.slice(0, 7) < month;
  const canGoForward = month < thisMonth;
  const monthDate = fromDayKey(`${month}-01`);
  const title = (
    month.slice(0, 4) === thisMonth.slice(0, 4) ? monthFormat : monthYearFormat
  ).format(monthDate);

  function mark(day: string): CalendarMark | undefined {
    // Not happened yet, or before there was anything to track.
    if (day > today || (data !== undefined && day < data.firstDay)) return 'future';
    const state = states.get(day);
    return state === undefined ? undefined : MARKS[state];
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <CalendarHeader
        title={title}
        summary={judged.length === 0 ? undefined : `${fullDays} of ${judged.length} days`}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={!canGoBack}
          hitSlop={8}
          onPress={() => setMonth(shiftMonth(month, -1))}
          style={({ pressed }) => [
            styles.chevron,
            !canGoBack && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Icon icon={ArrowLeft01Icon} size={20} strokeWidth={2} themeColor="text" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          disabled={!canGoForward}
          hitSlop={8}
          onPress={() => setMonth(shiftMonth(month, 1))}
          style={({ pressed }) => [
            styles.chevron,
            !canGoForward && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Icon icon={ArrowRight01Icon} size={20} strokeWidth={2} themeColor="text" />
        </Pressable>
      </CalendarHeader>

      <CalendarWeekdays />

      <View style={styles.grid}>
        {monthWeeks(month).map((week, row) => (
          <View key={row} style={styles.week}>
            {week.map((day, column) => {
              if (day === null) return <CalendarDay key={column} />;
              const state = states.get(day);
              return (
                <CalendarDay
                  key={column}
                  mark={mark(day)}
                  today={day === today}
                  accessibilityLabel={`${dayLabelFormat.format(fromDayKey(day))}${
                    day === today ? ', today' : ''
                  }${state === undefined ? '' : `, ${STATE_LABELS[state]}`}`}
                />
              );
            })}
          </View>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  chevron: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.3,
  },
  pressed: {
    opacity: 0.6,
  },
  // Rows keep their size and share out the slack, so a six-week month still
  // fits the card (flexible rows let the last one spill past it).
  grid: {
    flex: 1,
    justifyContent: 'space-between',
  },
  week: {
    flexDirection: 'row',
  },
});
