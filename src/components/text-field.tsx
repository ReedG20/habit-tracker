'use no memo';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from './themed-text';

import { ControlHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  label: string;
  /**
   * Set to a function that returns the field's current text. Reading it at
   * submit time is reliable where the last `onChangeText` may still be in
   * flight (the SwiftUI field delivers change events asynchronously).
   */
  readValueRef?: MutableRefObject<(() => string) | null>;
  /** Fires when the field gains or loses focus; the same on the SwiftUI field. */
  onFocusChange?: (focused: boolean) => void;
};

export function TextField({
  label,
  style,
  multiline,
  defaultValue,
  onChangeText,
  readValueRef,
  onFocusChange,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const latest = useRef(defaultValue ?? '');

  useEffect(() => {
    if (readValueRef) readValueRef.current = () => latest.current;
  }, [readValueRef]);

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <TextInput
          style={[styles.input, { color: theme.text }, multiline && styles.multiline, style]}
          placeholderTextColor={theme.textSecondary}
          multiline={multiline}
          defaultValue={defaultValue}
          onChangeText={(value) => {
            latest.current = value;
            onChangeText?.(value);
          }}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          {...rest}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  // A capsule when it's one line; the multiline field keeps the same corner.
  inputWrap: {
    borderRadius: ControlHeight / 2,
    borderWidth: 1,
  },
  input: {
    minHeight: ControlHeight,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    fontWeight: 500,
  },
  multiline: {
    minHeight: 88,
    paddingVertical: Spacing.three,
    textAlignVertical: 'top',
  },
});
