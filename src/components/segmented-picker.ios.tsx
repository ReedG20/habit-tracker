import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

import type { SegmentedPickerProps } from './segmented-picker.types';

/** The system segmented control, which picks up liquid glass on iOS 26. */
export function SegmentedPicker<T extends string>({
  options,
  value,
  onChange,
}: SegmentedPickerProps<T>) {
  return (
    <Host matchContents={{ vertical: true }}>
      <Picker<T>
        selection={value}
        onSelectionChange={onChange}
        modifiers={[pickerStyle('segmented')]}>
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
