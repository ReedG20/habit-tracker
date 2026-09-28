import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormSheetActions } from './form-sheet-actions';
import { KeyboardDoneBar } from './keyboard/keyboard-done-bar';
import { KeyboardScrollView } from './keyboard/keyboard-scroll-view';
import { ThemedText } from './themed-text';

import { Fonts, Spacing } from '@/constants/theme';

export type FormSheetProps = {
  title: string;
  submitLabel: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  children: ReactNode;
};

export function FormSheet({
  title,
  submitLabel,
  onSubmit,
  submitDisabled = false,
  children,
}: FormSheetProps) {
  const [actionsHeight, setActionsHeight] = useState(0);

  // The fields scroll so the keyboard never hides the one being typed in; the
  // actions stay pinned under them, behind the keyboard until it's dismissed.
  return (
    <View style={styles.sheet}>
      <KeyboardScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        bottomInset={actionsHeight}
        alwaysBounceVertical={false}>
        <ThemedText style={styles.title} themeColor="text">
          {title}
        </ThemedText>
        <View style={styles.fields}>{children}</View>
      </KeyboardScrollView>
      <View
        style={styles.actions}
        onLayout={(event) => setActionsHeight(event.nativeEvent.layout.height)}>
        <FormSheetActions submitLabel={submitLabel} onSubmit={onSubmit} disabled={submitDisabled} />
      </View>
      <KeyboardDoneBar />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  actions: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  title: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
  },
  fields: {
    gap: Spacing.three,
  },
});
