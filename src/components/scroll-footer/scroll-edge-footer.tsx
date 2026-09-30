import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { isScrollEdgeAvailable, ScrollEdgeContainer } from '../../../modules/scroll-edge';

import { useTheme } from '@/hooks/use-theme';

/** How far the fallback fade reaches above the footer. */
const FADE = 32;
/** How deep the top edge's treatment runs into the scroll view. */
const HEADER_DEPTH = 24;

export type ScrollEdgeFooterProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout: (event: LayoutChangeEvent) => void;
  under: SharedValue<number>;
};

/**
 * A screen's actions, floating over the bottom of its scroll view rather than
 * cutting it off. Get the props from `useScrollEdge`. Content scrolls on
 * underneath them, and the edge treatment appears only while it does:
 *
 * - iOS 26+: the system's own scroll edge effect, the soft blur toolbars get
 *   (see `modules/scroll-edge`).
 * - Elsewhere: a fade into the screen's background.
 *
 * Render it after the scroll view, in the same parent, and keep that parent
 * from being flattened (`collapsable={false}`): the native view looks for the
 * scroll view among its siblings.
 */
export function ScrollEdgeFooter({ children, style, onLayout, under }: ScrollEdgeFooterProps) {
  if (isScrollEdgeAvailable && ScrollEdgeContainer !== null) {
    return (
      <ScrollEdgeContainer effectStyle="soft" onLayout={onLayout} style={[styles.pinned, style]}>
        {children}
      </ScrollEdgeContainer>
    );
  }

  return (
    <View onLayout={onLayout} style={[styles.pinned, style]}>
      <Fade edge="bottom" shown={under} style={styles.footerFade} />
      {children}
    </View>
  );
}

export type ScrollEdgeHeaderProps = {
  above: SharedValue<number>;
  /** How deep into the scroll view content softens on its way out. */
  depth?: number;
};

/**
 * The top edge's counterpart to `ScrollEdgeFooter`, for a scroll view that
 * starts under something pinned (a title, a picker): once scrolled, content
 * fades away into the background above instead of being sliced off. It holds
 * nothing, just a strip along the top of the scroll view, so taps go through.
 *
 * Always the fade, even on iOS 26: the system effect sizes itself to what its
 * container holds (glass, controls), and an empty strip gets none. Screens
 * that use it have a solid background, where the fade reads the same.
 *
 * Render it after the scroll view, in a parent that starts where it starts.
 */
export function ScrollEdgeHeader({ above, depth = HEADER_DEPTH }: ScrollEdgeHeaderProps) {
  return <Fade edge="top" shown={above} style={[styles.header, { height: depth }]} />;
}

function Fade({
  edge,
  shown,
  style,
}: {
  edge: 'top' | 'bottom';
  shown: SharedValue<number>;
  style: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const visible = useAnimatedStyle(() => ({
    opacity: withTiming(shown.get(), { duration: 180 }),
  }));
  const id = `scroll-edge-fade-${edge}`;
  // Solid at the edge itself, clear toward the content.
  const [from, to] = edge === 'top' ? [1, 0] : [0, 1];

  return (
    <Animated.View pointerEvents="none" style={[style, visible]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.background} stopOpacity={from} />
            <Stop offset="0.5" stopColor={theme.background} stopOpacity={0.7} />
            <Stop offset="1" stopColor={theme.background} stopOpacity={to} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pinned: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footerFade: {
    position: 'absolute',
    top: -FADE,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
