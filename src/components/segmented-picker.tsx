import { Pressable, StyleSheet, View } from 'react-native';

import type { SegmentedPickerProps } from './segmented-picker.types';
import { ThemedText } from './themed-text';

import { ControlHeight, PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Android and web fallback for the native segmented control. */
export function SegmentedPicker<T extends string>({
  options,
  value,
  onChange,
}: SegmentedPickerProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type={selected ? 'smallSemibold' : 'small'}>{option.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: ControlHeight,
    borderRadius: PillRadius,
    padding: Spacing.one,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: PillRadius,
  },
});
