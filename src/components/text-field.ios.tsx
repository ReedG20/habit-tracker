import { Host, TextField as NativeTextField, useNativeState } from '@expo/ui/swift-ui';
import {
  background,
  font,
  foregroundStyle,
  frame,
  padding,
  shapes,
  textFieldStyle,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TextFieldProps } from './text-field';
import { ThemedText } from './themed-text';

import { ControlHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Fills the RN-sized host; SwiftUI has no "infinite" over the bridge, so a large cap stands in. */
const FILL = 100_000;

/**
 * A SwiftUI text field, so the sheet can host native buttons and pickers too:
 * only an RN `TextInput` loses first responder to a SwiftUI host, not a
 * SwiftUI field. Takes the same props as the RN version so the field files
 * stay shared.
 */
export function TextField({
  label,
  defaultValue,
  onChangeText,
  placeholder,
  multiline,
  autoCapitalize,
  readValueRef,
  onFocusChange,
}: TextFieldProps) {
  const theme = useTheme();
  const text = useNativeState(defaultValue ?? '');

  // The native state is the source of truth and reads synchronously; change
  // events trail it, and a fast tap on a submit button can beat the last one.
  useEffect(() => {
    if (readValueRef) readValueRef.current = () => text.get();
  }, [readValueRef, text]);

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Host matchContents={{ vertical: true }}>
        <NativeTextField
          text={text}
          placeholder={placeholder}
          axis={multiline ? 'vertical' : 'horizontal'}
          onTextChange={onChangeText}
          onFocusChange={onFocusChange}
          modifiers={[
            textFieldStyle('plain'),
            textInputAutocapitalization(
              autoCapitalize === 'none' ? 'never' : (autoCapitalize ?? 'sentences'),
            ),
            font({ size: 16, weight: 'medium' }),
            foregroundStyle(theme.text),
            // One line is a capsule the height of a button; the multiline
            // field keeps the same corner, so it reads as the capsule grown taller.
            padding(multiline ? { all: Spacing.three } : { horizontal: Spacing.three }),
            frame(
              multiline
                ? { maxWidth: FILL, minHeight: 88, alignment: 'topLeading' }
                : { maxWidth: FILL, minHeight: ControlHeight, alignment: 'leading' },
            ),
            background(
              theme.backgroundElement,
              shapes.roundedRectangle({ cornerRadius: ControlHeight / 2 }),
            ),
          ]}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
});
