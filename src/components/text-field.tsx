'use no memo';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from './themed-text';

import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  label: string;
  /**
   * Set to a function that returns the field's current text. Reading it at
   * submit time is reliable where the last `onChangeText` may still be in
   * flight (the SwiftUI field delivers change events asynchronously).
   */
  readValueRef?: MutableRefObject<(() => string) | null>;
};

export function TextField({
  label,
  style,
  multiline,
  defaultValue,
  onChangeText,
  readValueRef,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const latest = useRef(defaultValue ?? '');

  useEffect(() => {
    if (readValueRef) readValueRef.current = () => latest.current;
  }, [readValueRef]);

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
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
  inputWrap: {
    borderRadius: BorderRadius,
    borderWidth: 1,
  },
  input: {
    padding: Spacing.three,
    fontSize: 16,
    fontWeight: 500,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
