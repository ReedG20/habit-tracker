import { StyleSheet, View } from 'react-native';

import { daysUntil, dueInDays } from '@/components/commitment/draft';
import { ChoiceChip } from '@/components/onboarding/choice-chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';

const PRESET_DAYS = [7, 14, 20, 30] as const;

export type DeadlinePresetsProps = {
  value: number;
  onChange: (dueAt: number) => void;
};

/**
 * "In 7 / 14 / 20 / 30 days" under the deadline picker. A tap moves the date
 * and keeps the time; the chip matching the picked day stays lit.
 */
export function DeadlinePresets({ value, onChange }: DeadlinePresetsProps) {
  const current = daysUntil(value, useNow());

  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        In
      </ThemedText>
      {PRESET_DAYS.map((days) => (
        <ChoiceChip
          key={days}
          label={`${days} days`}
          selected={current === days}
          onPress={() => onChange(dueInDays(days, value))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
