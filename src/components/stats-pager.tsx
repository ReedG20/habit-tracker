import { Children, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type StatsPagerProps = {
  children: ReactNode;
  /** Accessibility label for each page's dot, e.g. "Show stats". */
  pageLabels: string[];
};

/**
 * Pages that swipe sideways, each as tall as the first. The pager runs to the
 * screen edges (past `ScreenScrollView`'s side padding), so a card slides all
 * the way off instead of being clipped at the inset.
 */
export function StatsPager({ children, pageLabels }: StatsPagerProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState<number>();
  const [page, setPage] = useState(0);

  const pages = Children.toArray(children);
  const pageWidth = width + Spacing.three * 2;

  return (
    <View style={styles.container}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            if (pageWidth === 0) return;
            const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
            if (next !== page) setPage(next);
          }}
          style={styles.scroller}>
          {pages.map((child, index) => (
            <View
              key={index}
              style={[styles.page, { width: pageWidth }]}
              onLayout={
                index === 0 ? (event) => setHeight(event.nativeEvent.layout.height) : undefined
              }>
              {index === 0 ? child : <View style={{ height }}>{child}</View>}
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.dots}>
        {pages.map((_, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={pageLabels[index]}
            accessibilityState={{ selected: index === page }}
            hitSlop={8}
            onPress={() => scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true })}>
            <View
              style={[
                styles.dot,
                { backgroundColor: index === page ? theme.text : theme.backgroundSelected },
              ]}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  scroller: {
    marginHorizontal: -Spacing.three,
  },
  page: {
    paddingHorizontal: Spacing.three,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
