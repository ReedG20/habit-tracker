import { StyleSheet, View } from 'react-native';

import { SegmentedPicker } from '@/components/segmented-picker';
import { ThemedText } from '@/components/themed-text';
import { DAILY } from '@/convex/lib/frequency';
import { Spacing } from '@/constants/theme';

type FrequencyValue = '1' | '2' | '3' | '4' | '5' | '6' | '7';

const options: { value: FrequencyValue; label: string }[] = [
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
  { value: '3', label: '3×' },
  { value: '4', label: '4×' },
  { value: '5', label: '5×' },
  { value: '6', label: '6×' },
  { value: '7', label: 'Daily' },
];

/** The rule in words, under the control, so "3×" is never a guess. */
function describe(timesPerWeek: number): string {
  if (timesPerWeek >= DAILY) return 'Every day, before midnight.';
  const days = timesPerWeek === 1 ? 'one day' : `${timesPerWeek} days`;
  return `Any ${days} a week, your pick. Weeks run Monday to Sunday.`;
}

export type FrequencyPickerProps = {
  value: number;
  onChange: (timesPerWeek: number) => void;
};

/** How often a habit is due: some days each week, on any days, or every day. */
export function FrequencyPicker({ value, onChange }: FrequencyPickerProps) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        How often?
      </ThemedText>
      <SegmentedPicker
        options={options}
        value={String(value) as FrequencyValue}
        onChange={(next) => onChange(Number(next))}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {describe(value)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
});
