import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { PillRadius, Spacing } from '@/constants/theme';

export type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * Plain React Native rather than `@expo/ui`'s SwiftUI `SegmentedControl`: a
 * SwiftUI `Host` in a sheet steals first responder from RN `TextInput`s.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <ThemedView type="backgroundElement" style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.segment, pressed && styles.pressed]}>
            <ThemedView
              type={selected ? 'backgroundSelected' : 'backgroundElement'}
              style={styles.chip}>
              <ThemedText type="smallSemibold" themeColor={selected ? 'text' : 'textSecondary'}>
                {option.label}
              </ThemedText>
            </ThemedView>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: PillRadius,
  },
  segment: {
    flex: 1,
  },
  chip: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: PillRadius,
  },
  pressed: {
    opacity: 0.7,
  },
});
