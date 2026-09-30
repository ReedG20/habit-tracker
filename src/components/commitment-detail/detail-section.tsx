import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';

export type DetailSectionProps = {
  /** Lowercase, like the tab screens' section headings. */
  title: string;
  /** A short aside on the heading's right: "42 logs". */
  meta?: string;
  children: ReactNode;
};

/** A headed block on a commitment's detail screen. */
export function DetailSection({ title, meta, children }: DetailSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <ThemedText style={styles.title} themeColor="text">
          {title}
        </ThemedText>
        {meta === undefined ? null : (
          <ThemedText type="small" themeColor="textSecondary">
            {meta}
          </ThemedText>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  title: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
  },
});
