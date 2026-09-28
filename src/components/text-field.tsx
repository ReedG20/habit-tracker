'use no memo';

import { useEffect, useImperativeHandle, useRef, type MutableRefObject, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useFieldFocus } from './keyboard/keyboard-scroll-view';
import { ThemedText } from './themed-text';

import { ControlHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** What a parent can do to a field: move focus to it, e.g. from the field before it. */
export type TextFieldHandle = {
  focus: () => void;
  blur: () => void;
};

export type TextFieldProps = TextInputProps & {
  ref?: Ref<TextFieldHandle>;
  label: string;
  /**
   * Set to a function that returns the field's current text. Reading it at
   * submit time is reliable where the last `onChangeText` may still be in
   * flight (the SwiftUI field delivers change events asynchronously).
   */
  readValueRef?: MutableRefObject<(() => string) | null>;
  /** Fires when the field gains or loses focus; the same on the SwiftUI field. */
  onFocusChange?: (focused: boolean) => void;
  /** Fires on the Return key of a single-line field, e.g. to focus the next one. */
  onSubmit?: () => void;
};

export function TextField({
  ref,
  label,
  style,
  multiline,
  defaultValue,
  onChangeText,
  readValueRef,
  onFocusChange,
  onSubmit,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const latest = useRef(defaultValue ?? '');
  const input = useRef<TextInput>(null);
  const fieldRef = useRef<View>(null);
  const fieldFocus = useFieldFocus();
  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    blur: () => input.current?.blur(),
  }));

  useEffect(() => {
    if (readValueRef) readValueRef.current = () => latest.current;
  }, [readValueRef]);

  return (
    <View ref={fieldRef} style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <TextInput
          ref={input}
          style={[styles.input, { color: theme.text }, multiline && styles.multiline, style]}
          placeholderTextColor={theme.textSecondary}
          multiline={multiline}
          defaultValue={defaultValue}
          onChangeText={(value) => {
            latest.current = value;
            onChangeText?.(value);
          }}
          onFocus={() => {
            if (fieldRef.current) fieldFocus.focus(fieldRef.current);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            if (fieldRef.current) fieldFocus.blur(fieldRef.current);
            onFocusChange?.(false);
          }}
          onSubmitEditing={onSubmit ? () => onSubmit() : undefined}
          // Handing focus on keeps the keyboard up instead of blinking it away.
          submitBehavior={onSubmit ? 'submit' : undefined}
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
