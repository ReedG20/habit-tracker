import { useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { CalendarDayState } from '@/convex/calendar';
import { dayOfWeek, daysBefore, daysBetween } from '@/convex/lib/days';
import { useTheme } from '@/hooks/use-theme';
import { fromDayKey, todayKey } from '@/lib/dates';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DOT = 12;
const RING_GAP = 1.5;
const RING_WIDTH = 1.5;
/** A dot with room for today's ring around it. */
const RING = DOT + 2 * (RING_GAP + RING_WIDTH);

const STATE_LABELS: Record<CalendarDayState, string> = {
  full: 'all done',
  partial: 'some done',
  missed: 'missed',
  frozen: 'frozen',
  none: 'nothing due',
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
  const theme = useTheme();
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

  function dotStyle(day: string) {
    // Not happened yet, or before there was anything to track.
    if (day > today || (data !== undefined && day < data.firstDay)) {
      return { backgroundColor: theme.backgroundSelected, opacity: 0.5 };
    }
    switch (states.get(day)) {
      case 'full':
        return { backgroundColor: theme.accent };
      case 'partial':
        // ~35% of the accent.
        return { backgroundColor: `${theme.accent}59` };
      case 'missed':
        return { backgroundColor: theme.backgroundSelected };
      case 'frozen':
        return { borderWidth: 2, borderColor: theme.primary };
      case 'none':
        return { borderWidth: 1, borderColor: theme.border };
      default:
        return undefined;
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {judged.length === 0 ? ' ' : `${fullDays} of ${judged.length} days`}
          </ThemedText>
        </View>
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
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((weekday, index) => (
          <ThemedText key={index} themeColor="textSecondary" style={styles.weekday}>
            {weekday}
          </ThemedText>
        ))}
      </View>

      <View style={styles.grid}>
        {monthWeeks(month).map((week, row) => (
          <View key={row} style={[styles.week, styles.gridRow]}>
            {week.map((day, column) => {
              const state = day === null ? undefined : states.get(day);
              return (
                <View
                  key={column}
                  style={styles.cell}
                  accessible={day !== null}
                  accessibilityLabel={
                    day === null
                      ? undefined
                      : `${dayLabelFormat.format(fromDayKey(day))}${
                          day === today ? ', today' : ''
                        }${state === undefined ? '' : `, ${STATE_LABELS[state]}`}`
                  }>
                  {day !== null && (
                    <View style={[styles.ring, day === today && { borderColor: theme.text }]}>
                      <View style={[styles.dot, dotStyle(day)]} />
                    </View>
                  )}
                </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  heading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
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
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 600,
  },
  // Rows keep their size and share out the slack, so a six-week month still
  // fits the card (flexible rows let the last one spill past it).
  grid: {
    flex: 1,
    justifyContent: 'space-between',
  },
  gridRow: {
    height: RING,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Always there, so today's ring doesn't shift its dot.
  ring: {
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
});
