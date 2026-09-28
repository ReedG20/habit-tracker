import {
  Host,
  TextField as NativeTextField,
  useNativeState,
  type TextFieldRef,
} from '@expo/ui/swift-ui';
import {
  background,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  onSubmit,
  padding,
  shapes,
  submitLabel,
  textFieldStyle,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type TextInputProps } from 'react-native';

import { useFieldFocus } from './keyboard/keyboard-scroll-view';
import type { TextFieldProps } from './text-field';
import { ThemedText } from './themed-text';

import { ControlHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Fills the RN-sized host; SwiftUI has no "infinite" over the bridge, so a large cap stands in. */
const FILL = 100_000;

type SubmitLabel = Parameters<typeof submitLabel>[0];

/** RN's return key names that SwiftUI has a submit label for; the rest keep the default. */
const submitLabels: Partial<Record<NonNullable<TextInputProps['returnKeyType']>, SubmitLabel>> = {
  done: 'done',
  go: 'go',
  next: 'next',
  search: 'search',
  send: 'send',
  join: 'join',
  route: 'route',
};

/**
 * A SwiftUI text field, so the sheet can host native buttons and pickers too:
 * only an RN `TextInput` loses first responder to a SwiftUI host, not a
 * SwiftUI field. Takes the same props as the RN version so the field files
 * stay shared.
 */
export function TextField({
  ref,
  label,
  defaultValue,
  onChangeText,
  placeholder,
  multiline,
  autoCapitalize,
  readValueRef,
  onFocusChange,
  returnKeyType,
  onSubmit: onReturn,
}: TextFieldProps) {
  const theme = useTheme();
  const native = useRef<TextFieldRef>(null);
  useImperativeHandle(ref, () => ({
    focus: () => void native.current?.focus(),
    blur: () => void native.current?.blur(),
  }));
  const returnLabel = returnKeyType ? submitLabels[returnKeyType] : undefined;
  const fieldRef = useRef<View>(null);
  const fieldFocus = useFieldFocus();
  const text = useNativeState(defaultValue ?? '');

  // The native state is the source of truth and reads synchronously; change
  // events trail it, and a fast tap on a submit button can beat the last one.
  useEffect(() => {
    if (readValueRef) readValueRef.current = () => text.get();
  }, [readValueRef, text]);

  return (
    <View ref={fieldRef} style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {/* Inline in RN layout: safe areas and the keyboard are RN's to handle.
          Left on, the hosting controller offsets the field inside its frame,
          drawing the multiline box over its label. */}
      <Host matchContents={{ vertical: true }} ignoreSafeArea="all">
        <NativeTextField
          ref={native}
          text={text}
          placeholder={placeholder}
          axis={multiline ? 'vertical' : 'horizontal'}
          onTextChange={onChangeText}
          onFocusChange={(focused) => {
            if (fieldRef.current) {
              if (focused) fieldFocus.focus(fieldRef.current);
              else fieldFocus.blur(fieldRef.current);
            }
            onFocusChange?.(focused);
          }}
          modifiers={[
            textFieldStyle('plain'),
            // Three lines tall from the start so the whole box takes a tap (a
            // frame around the field doesn't), growing to eight before it scrolls.
            ...(multiline ? [lineLimit({ min: 3, max: 8 })] : []),
            textInputAutocapitalization(
              autoCapitalize === 'none' ? 'never' : (autoCapitalize ?? 'sentences'),
            ),
            ...(returnLabel ? [submitLabel(returnLabel)] : []),
            ...(onReturn ? [onSubmit(onReturn)] : []),
            font({ size: 16, weight: 'medium' }),
            foregroundStyle(theme.text),
            // One line is a capsule the height of a button; the multiline
            // field keeps the same corner, so it reads as the capsule grown taller.
            padding(multiline ? { all: Spacing.three } : { horizontal: Spacing.three }),
            frame(
              multiline
                ? { maxWidth: FILL, alignment: 'topLeading' }
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
