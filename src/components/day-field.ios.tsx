import { DatePicker, Host, Text } from '@expo/ui/swift-ui';
import { datePickerStyle, font, foregroundStyle, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, View } from 'react-native';

import type { DayFieldProps } from './day-field';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromDayKey, toDayKey } from '@/lib/dates';

/** Fills the RN-sized host; SwiftUI has no "infinite" over the bridge, so a large cap stands in. */
const FILL = 100_000;

/**
 * The system compact picker with only a date chip, on its own row with its
 * own title, like `DeadlineField`. Days in and out are `YYYY-MM-DD` keys.
 */
export function DayField({ value, onChange, label, min, max }: DayFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <Host matchContents={{ vertical: true }} ignoreSafeArea="all">
        <DatePicker
          selection={fromDayKey(value)}
          displayedComponents={['date']}
          range={{ start: fromDayKey(min), end: fromDayKey(max) }}
          onDateChange={(date) => onChange(toDayKey(date))}
          modifiers={[
            datePickerStyle('compact'),
            tint(theme.primary),
            frame({ maxWidth: FILL, minHeight: 44 }),
          ]}>
          <Text
            modifiers={[
              font({ size: 14, weight: 'medium' }),
              foregroundStyle(theme.textSecondary),
            ]}>
            {label}
          </Text>
        </DatePicker>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
});
