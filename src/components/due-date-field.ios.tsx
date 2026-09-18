import { Button, DatePicker, Host, HStack, Spacer, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  datePickerStyle,
  font,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DueDateFieldProps } from './due-date-field';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromDayKey, toDayKey, todayKey } from '@/lib/dates';

/** Fills the RN-sized host; SwiftUI has no "infinite" over the bridge, so a large cap stands in. */
const FILL = 100_000;

/**
 * The system compact picker on its own row, with its own title: the standard
 * form-row layout, so the chip lands on the trailing edge and its popover
 * anchors inside the sheet. "Add" seeds today, since a SwiftUI picker always
 * shows a date; "Clear" goes back to none.
 */
export function DueDateField({ dueDay, onChange }: DueDateFieldProps) {
  const theme = useTheme();
  const label = [font({ size: 14, weight: 'bold' }), foregroundStyle(theme.textSecondary)];

  return (
    <View style={styles.field}>
      <Host matchContents={{ vertical: true }}>
        {dueDay ? (
          <DatePicker
            selection={fromDayKey(dueDay)}
            displayedComponents={['date']}
            onDateChange={(date) => onChange(toDayKey(date))}
            // Capped to the host's width: unconstrained, the compact picker lays
            // out wider than the sheet and its chip runs off the trailing edge.
            modifiers={[
              datePickerStyle('compact'),
              tint(theme.primary),
              frame({ maxWidth: FILL, minHeight: 44 }),
            ]}>
            <Text modifiers={label}>Due date</Text>
          </DatePicker>
        ) : (
          <HStack alignment="center" modifiers={[frame({ maxWidth: FILL, minHeight: 44 })]}>
            <Text modifiers={label}>Due date</Text>
            <Spacer />
            <Button
              onPress={() => onChange(todayKey())}
              modifiers={[buttonStyle('plain'), accessibilityLabel('Add due date')]}>
              <Text modifiers={label}>Add</Text>
            </Button>
          </HStack>
        )}
      </Host>

      {dueDay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear due date"
          onPress={() => onChange(undefined)}
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            Clear
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  clear: {
    alignSelf: 'flex-end',
  },
  pressed: {
    opacity: 0.7,
  },
});
