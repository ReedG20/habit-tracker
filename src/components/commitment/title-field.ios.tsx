import {
  Host,
  TextField as NativeTextField,
  useNativeState,
  type TextFieldRef,
} from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  lineLimit,
  submitLabel,
  textFieldStyle,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { TITLE_FONT_SIZE, type TitleFieldProps } from './title-field.types';

import { useFieldFocus } from '@/components/keyboard/keyboard-scroll-view';
import { titleFontFamily } from '@/constants/custom-fonts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Fills the RN-sized host; SwiftUI has no "infinite" over the bridge, so a large cap stands in. */
const FILL = 100_000;

/**
 * The commitment's name, typed like the heading of a document: large, bold,
 * no box around it, wrapping onto a second line rather than scrolling
 * sideways. A SwiftUI field for the same reason as `TextField`: the step also
 * hosts native pickers, which would steal focus from an RN input.
 */
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
  const native = useRef<TextFieldRef>(null);
  useImperativeHandle(ref, () => ({
    focus: () => void native.current?.focus(),
    blur: () => void native.current?.blur(),
  }));
  const fieldRef = useRef<View>(null);
  const fieldFocus = useFieldFocus();
  const text = useNativeState(defaultValue ?? '');

  useEffect(() => {
    if (readValueRef) readValueRef.current = () => text.get().replace(/\n/g, '');
  }, [readValueRef, text]);

  return (
    <View
      ref={fieldRef}
      accessibilityLabel={accessibilityLabel}
      style={[styles.field, { borderBottomColor: theme.border }]}>
      <Host matchContents={{ vertical: true }} ignoreSafeArea="all">
        <NativeTextField
          ref={native}
          text={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          maxLength={maxLength}
          // Vertical so a long name wraps like a heading. Return would add a
          // newline there, so a newline is taken as Return instead.
          axis="vertical"
          onTextChange={(value) => {
            if (value.includes('\n')) {
              const line = value.replace(/\n/g, '');
              text.set(line);
              onChangeText?.(line);
              onSubmit?.();
              return;
            }
            onChangeText?.(value);
          }}
          onFocusChange={(focused) => {
            if (fieldRef.current) {
              if (focused) fieldFocus.focus(fieldRef.current);
              else fieldFocus.blur(fieldRef.current);
            }
          }}
          modifiers={[
            textFieldStyle('plain'),
            lineLimit({ min: 1, max: 3 }),
            textInputAutocapitalization('sentences'),
            submitLabel('done'),
            font({ family: titleFontFamily, size: TITLE_FONT_SIZE }),
            foregroundStyle(theme.text),
            frame({ maxWidth: FILL, alignment: 'leading' }),
          ]}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    paddingBottom: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
