import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export type CalendarHeaderProps = {
  /** What the grid covers: "September", "Last 5 weeks". */
  title: string;
  /** How it went: "18 of 22 days". A blank line keeps the height while loading. */
  summary?: string;
  /** Anything on the right, such as month chevrons. */
  children?: ReactNode;
};

/** The heading row every calendar card opens with. */
export function CalendarHeader({ title, summary, children }: CalendarHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.heading}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {summary ?? ' '}
        </ThemedText>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  heading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
});
