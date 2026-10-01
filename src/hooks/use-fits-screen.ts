import { useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Keeps a full-screen page to one screen where it can, by dropping its
 * optional extras one at a time, least important first, while it would
 * scroll. Spread `scrollProps` on the page's ScrollView, which still scrolls
 * if the rest doesn't fit either (a small phone, large text).
 */
export function useFitsScreen(enabled: boolean, extras: number) {
  const [dropped, setDropped] = useState(0);
  const viewport = useRef(0);
  const content = useRef(0);
  // One drop per measurement: both callbacks can see the same overflow before the drop renders.
  const droppedAt = useRef(0);

  const check = () => {
    if (!enabled || viewport.current === 0 || content.current === 0) return;
    if (content.current > viewport.current + 1 && content.current !== droppedAt.current) {
      droppedAt.current = content.current;
      setDropped((current) => Math.min(current + 1, extras));
    }
  };

  return {
    /** Whether the extra ranked `rank` (0 is the most important) still fits. */
    shows: (rank: number) => !enabled || rank < extras - dropped,
    scrollProps: {
      onLayout: (event: LayoutChangeEvent) => {
        viewport.current = event.nativeEvent.layout.height;
        check();
      },
      onContentSizeChange: (_width: number, height: number) => {
        content.current = height;
        check();
      },
    },
  };
}
