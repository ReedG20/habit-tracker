import { StyleSheet, View } from 'react-native';

import { DOT, RING, RING_GAP, RING_WIDTH, markStyle, type CalendarMark } from './calendar-marks';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The weekday letters over a Monday-first grid of `CalendarDay`s. */
export function CalendarWeekdays() {
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no">
      {WEEKDAYS.map((letter, index) => (
        <ThemedText key={index} themeColor="textSecondary" style={styles.weekday}>
          {letter}
        </ThemedText>
      ))}
    </View>
  );
}

export type CalendarDayProps = {
  /** Leave out for a blank cell (the days before the 1st of a month). */
  mark?: CalendarMark;
  today?: boolean;
  accessibilityLabel?: string;
};

/** One day: its dot, ringed when it's today. Takes an equal share of its row. */
export function CalendarDay({ mark, today = false, accessibilityLabel }: CalendarDayProps) {
  const theme = useTheme();
  return (
    <View
      style={styles.cell}
      accessible={mark !== undefined}
      accessibilityLabel={accessibilityLabel}>
      {mark === undefined ? null : (
        // The ring is always there, so today's doesn't shift its dot.
        <View style={[styles.ring, today && { borderColor: theme.text }]}>
          <View style={[styles.dot, markStyle(mark, theme)]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    // Tight on purpose: a six-week month has to fit the Me screen's pager,
    // whose height comes from its stats page.
    lineHeight: 14,
    fontWeight: 600,
  },
  cell: {
    flex: 1,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
