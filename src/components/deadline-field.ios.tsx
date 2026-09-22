import { DatePicker, Host, Text } from '@expo/ui/swift-ui';
import { datePickerStyle, font, foregroundStyle, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, View } from 'react-native';

import type { DeadlineFieldProps } from './deadline-field';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Fills the RN-sized host; SwiftUI has no "infinite" over the bridge, so a large cap stands in. */
const FILL = 100_000;

/**
 * The system compact picker with both a date and a time chip, on its own row
 * with its own title: the standard form-row layout, so the chips land on the
 * trailing edge and their popovers anchor inside the screen.
 */
export function DeadlineField({ value, onChange, label = 'Deadline' }: DeadlineFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <Host matchContents={{ vertical: true }}>
        <DatePicker
          selection={new Date(value)}
          displayedComponents={['date', 'hourAndMinute']}
          onDateChange={(date) => onChange(date.getTime())}
          // Capped to the host's width: unconstrained, the compact picker lays
          // out wider than the screen and its chips run off the trailing edge.
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
