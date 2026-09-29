import { useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, View, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDoneBar } from '@/components/keyboard/keyboard-done-bar';
import { KeyboardScrollView } from '@/components/keyboard/keyboard-scroll-view';
import { Spacing } from '@/constants/theme';

export type StepLayoutProps = {
  children: ReactNode;
  /** Pinned above the body, so it stays put while the body scrolls (e.g. a mode switch). */
  header?: ReactNode;
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
 *
 * The keyboard covers the footer while it's up (the Done bar rides on it
 * instead), which leaves the most room for the field being typed in.
 */
export function StepLayout({
  children,
  header,
  footer,
  scrollRef,
  locked = false,
}: StepLayoutProps) {
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);

  return (
    <View style={styles.fill}>
      {header === undefined ? null : <View style={styles.header}>{header}</View>}
      <KeyboardScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={[styles.body, header !== undefined && styles.bodyUnderHeader]}
        bottomInset={footerHeight}
        scrollEnabled={!locked}
        alwaysBounceVertical={false}>
        {children}
      </KeyboardScrollView>
      <View
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        {footer}
      </View>
      <KeyboardDoneBar />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  // Half the usual gap sits under the pinned header and half atop the body,
  // so at rest it reads the same, and scrolled content runs up closer to it.
  header: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  bodyUnderHeader: {
    paddingTop: Spacing.three,
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
