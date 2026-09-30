import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export type CalendarLegendItem = { label: string; style: ViewStyle };

/** What the marks mean, under a calendar. Hidden from VoiceOver: each day says it itself. */
export function CalendarLegend({ items }: { items: CalendarLegendItem[] }) {
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no">
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <View style={[styles.dot, item.style]} />
          <ThemedText type="small" themeColor="textSecondary">
            {item.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
    paddingTop: Spacing.one,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
