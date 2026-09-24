import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

import { themeOptions, type ThemePickerProps } from './theme-picker.types';

import type { ThemePreference } from '@/lib/theme-preference';

/** The system segmented control, which picks up liquid glass on iOS 26. */
export function ThemePicker({ value, onChange }: ThemePickerProps) {
  return (
    <Host matchContents={{ vertical: true }}>
      <Picker<ThemePreference>
        selection={value}
        onSelectionChange={onChange}
        modifiers={[pickerStyle('segmented')]}>
        {themeOptions.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
