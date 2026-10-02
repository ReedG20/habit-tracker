'use no memo';

import { useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { TITLE_FONT_SIZE, type TitleFieldProps } from './title-field.types';

import { useFieldFocus } from '@/components/keyboard/keyboard-scroll-view';
import { titleFontFamily } from '@/constants/custom-fonts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The RN fallback of the name field; see `title-field.ios.tsx`. */
export function TitleField({
  ref,
  accessibilityLabel,
  defaultValue,
  placeholder,
  autoFocus,
  maxLength,
  readValueRef,
  onChangeText,
  onSubmit,
}: TitleFieldProps) {
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
    <View ref={fieldRef} style={[styles.field, { borderBottomColor: theme.border }]}>
      <TextInput
        ref={input}
        accessibilityLabel={accessibilityLabel}
        style={[styles.input, { color: theme.text }]}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        maxLength={maxLength}
        autoCapitalize="sentences"
        multiline
        submitBehavior="blurAndSubmit"
        returnKeyType="done"
        onChangeText={(value) => {
          latest.current = value;
          onChangeText?.(value);
        }}
        onFocus={() => {
          if (fieldRef.current) fieldFocus.focus(fieldRef.current);
        }}
        onBlur={() => {
          if (fieldRef.current) fieldFocus.blur(fieldRef.current);
        }}
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    paddingBottom: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    fontSize: TITLE_FONT_SIZE,
    lineHeight: TITLE_FONT_SIZE * 1.2,
    fontFamily: titleFontFamily,
    padding: 0,
  },
});

export type { TitleFieldProps };
