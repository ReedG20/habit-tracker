import type { ReactNode, Ref } from 'react';
import { StyleSheet, View, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDoneBar } from '@/components/keyboard/keyboard-done-bar';
import { KeyboardScrollView } from '@/components/keyboard/keyboard-scroll-view';
import { ScrollEdgeFooter, ScrollEdgeHeader } from '@/components/scroll-footer/scroll-edge-footer';
import { useScrollEdge } from '@/components/scroll-footer/use-scroll-edge';
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
  /** Space between the body's sections, when the default leaves a step too tall to fit. */
  gap?: number;
};

/**
 * One step of the commitment flow: the body fills the space between the
 * header and the pinned actions. Steps are laid out to fit the screen, so the
 * body only scrolls when it can't, which in practice means the keyboard is up.
 *
 * The footer floats over the bottom of the body, so a body that does scroll
 * passes under it (softly, see `ScrollEdgeFooter`) instead of being cut off,
 * and softens away under the title at the top the same way.
 * The keyboard covers the footer while it's up (the Done bar rides on it
 * instead), which leaves the most room for the field being typed in.
 */
export function StepLayout({
  children,
  header,
  footer,
  scrollRef,
  locked = false,
  gap,
}: StepLayoutProps) {
  const insets = useSafeAreaInsets();
  const edge = useScrollEdge();

  return (
    <View style={styles.fill} collapsable={false}>
      {header === undefined ? null : <View style={styles.header}>{header}</View>}
      {/* Its own box, so the top edge sits where the scroll view starts. */}
      <View style={styles.fill} collapsable={false}>
        <KeyboardScrollView
          ref={scrollRef}
          style={styles.fill}
          contentContainerStyle={[
            styles.body,
            header !== undefined && styles.bodyUnderHeader,
            gap !== undefined && { gap },
            { paddingBottom: Spacing.three + edge.footerHeight },
          ]}
          {...edge.scrollProps}
          bottomInset={edge.footerHeight}
          scrollEnabled={!locked}
          alwaysBounceVertical={false}>
          {children}
        </KeyboardScrollView>
        <ScrollEdgeHeader {...edge.headerProps} />
      </View>
      <ScrollEdgeFooter
        {...edge.footerProps}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        {footer}
      </ScrollEdgeFooter>
      <KeyboardDoneBar />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  // Most of the gap sits under the pinned header and the rest atop the body,
  // so scrolled content runs up close to it without touching.
  header: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  bodyUnderHeader: {
    paddingTop: Spacing.two,
  },
  body: {
    flexGrow: 1,
    gap: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  footer: {
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
