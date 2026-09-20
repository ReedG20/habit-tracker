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

import { BorderRadius, Spacing } from '@/constants/theme';
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
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Host matchContents={{ vertical: true }}>
        <NativeTextField
          text={text}
          placeholder={placeholder}
          axis={multiline ? 'vertical' : 'horizontal'}
          onTextChange={onChangeText}
          modifiers={[
            textFieldStyle('plain'),
            textInputAutocapitalization(
              autoCapitalize === 'none' ? 'never' : (autoCapitalize ?? 'sentences'),
            ),
            font({ size: 16, weight: 'medium' }),
            foregroundStyle(theme.text),
            padding({ all: Spacing.three }),
            frame(
              multiline
                ? { maxWidth: FILL, minHeight: 88, alignment: 'topLeading' }
                : { maxWidth: FILL, alignment: 'leading' },
            ),
            background(
              theme.backgroundElement,
              shapes.roundedRectangle({ cornerRadius: BorderRadius }),
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
