import { useCallback, useMemo, useState } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
} from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

export type ScrollEdge = {
  /** Add to the scroll content's bottom padding, so its end clears the footer. */
  footerHeight: number;
  /** Spread onto the scroll view. */
  scrollProps: Pick<
    ScrollViewProps,
    | 'onScroll'
    | 'onContentSizeChange'
    | 'onLayout'
    | 'scrollIndicatorInsets'
    | 'scrollEventThrottle'
  >;
  /** Spread onto the `ScrollEdgeFooter`. */
  footerProps: {
    onLayout: (event: LayoutChangeEvent) => void;
    /** Content still below the visible part: 1 while there is, else 0. */
    under: SharedValue<number>;
  };
  /** Spread onto the `ScrollEdgeHeader`. */
  headerProps: {
    /** Content scrolled up past the top: 1 while there is, else 0. */
    above: SharedValue<number>;
  };
};

/**
 * Wires a scroll view to the `ScrollEdgeFooter` floating over its bottom (and
 * the `ScrollEdgeHeader` along its top): room at the end of the content for
 * the footer, and, for the fallback fades, whether any content is scrolled
 * past either edge right now. Shared values, so
 * scrolling never re-renders the screen.
 */
export function useScrollEdge(): ScrollEdge {
  const [footerHeight, setFooterHeight] = useState(0);
  const offset = useSharedValue(0);
  const content = useSharedValue(0);
  const viewport = useSharedValue(0);
  const under = useSharedValue(0);
  const above = useSharedValue(0);

  // The footer's padding sits at the end of the content, so anything past the
  // visible bottom is real content passing under the footer.
  const update = useCallback(() => {
    under.set(content.get() - offset.get() - viewport.get() > 1 ? 1 : 0);
    above.set(offset.get() > 1 ? 1 : 0);
  }, [above, content, offset, under, viewport]);

  const onFooterLayout = useCallback(
    (event: LayoutChangeEvent) => setFooterHeight(Math.round(event.nativeEvent.layout.height)),
    [],
  );

  return useMemo<ScrollEdge>(
    () => ({
      footerHeight,
      scrollProps: {
        scrollEventThrottle: 16,
        scrollIndicatorInsets: { bottom: footerHeight },
        onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          offset.set(event.nativeEvent.contentOffset.y);
          update();
        },
        onContentSizeChange: (_width: number, height: number) => {
          content.set(height);
          update();
        },
        onLayout: (event: LayoutChangeEvent) => {
          viewport.set(event.nativeEvent.layout.height);
          update();
        },
      },
      footerProps: { onLayout: onFooterLayout, under },
      headerProps: { above },
    }),
    [above, content, footerHeight, offset, onFooterLayout, under, update, viewport],
  );
}
