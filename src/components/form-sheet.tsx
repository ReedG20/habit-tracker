import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormSheetActions } from './form-sheet-actions';
import { KeyboardDoneBar } from './keyboard/keyboard-done-bar';
import { KeyboardScrollView } from './keyboard/keyboard-scroll-view';
import { ScrollEdgeFooter } from './scroll-footer/scroll-edge-footer';
import { useScrollEdge } from './scroll-footer/use-scroll-edge';
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
  const edge = useScrollEdge();

  // The fields scroll so the keyboard never hides the one being typed in; the
  // actions float over their bottom edge, behind the keyboard until it's dismissed.
  return (
    <View style={styles.sheet} collapsable={false}>
      <KeyboardScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Spacing.four + edge.footerHeight },
        ]}
        {...edge.scrollProps}
        bottomInset={edge.footerHeight}
        alwaysBounceVertical={false}>
        <ThemedText style={styles.title} themeColor="text">
          {title}
        </ThemedText>
        <View style={styles.fields}>{children}</View>
      </KeyboardScrollView>
      <ScrollEdgeFooter {...edge.footerProps} style={styles.actions}>
        <FormSheetActions submitLabel={submitLabel} onSubmit={onSubmit} disabled={submitDisabled} />
      </ScrollEdgeFooter>
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
    gap: Spacing.four,
  },
  actions: {
    paddingTop: Spacing.two,
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
