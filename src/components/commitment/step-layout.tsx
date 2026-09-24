import { useState, type ReactNode, type Ref } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

export type StepLayoutProps = {
  children: ReactNode;
  /** The step's actions, pinned to the same spot at the bottom of every step. */
  footer: ReactNode;
  scrollRef?: Ref<ScrollView>;
  /** Holds the body still, e.g. while a finger is signing. */
  locked?: boolean;
};

/**
 * One step of the commitment flow: the body fills the space between the
 * header and the pinned actions. Steps are laid out to fit the screen, so the
 * body only scrolls when it can't, which in practice means the keyboard is up.
 */
export function StepLayout({ children, footer, scrollRef, locked = false }: StepLayoutProps) {
  const insets = useSafeAreaInsets();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const overflowing = contentHeight > viewportHeight + 1;

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={styles.body}
        scrollEnabled={overflowing && !locked}
        bounces={false}
        showsVerticalScrollIndicator={overflowing}
        keyboardShouldPersistTaps="handled"
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => setContentHeight(height)}>
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
    gap: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  footer: {
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
