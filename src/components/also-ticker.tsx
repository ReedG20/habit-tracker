import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { ThemedText } from './themed-text';

import { PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ROTATE_MS = 4000;
const HEIGHT = 36;
const DOT = 5;

export type AlsoTickerProps = {
  /** Secondary stakes, most pressing first. */
  facts: string[];
};

/**
 * A quiet capsule under the hero that rotates through the stakes the headline
 * left out, with a dot per fact. A tap moves it on; with Reduce Motion it
 * stays on the first.
 */
export function AlsoTicker({ facts }: AlsoTickerProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const signature = facts.join('\n');
  const [state, setState] = useState({ signature, index: 0 });
  // New facts start over from the first rather than wherever the old ones were.
  const index = state.signature === signature ? state.index : 0;
  const advance = () =>
    setState((current) => ({
      signature,
      index: ((current.signature === signature ? current.index : 0) + 1) % facts.length,
    }));
  const rotates = facts.length > 1;

  useEffect(() => {
    if (reduceMotion || !rotates) return;
    const timer = setInterval(advance, ROTATE_MS);
    return () => clearInterval(timer);
    // `advance` only closes over `signature` and the count, both covered here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, rotates, signature]);

  if (facts.length === 0) return null;
  const current = index % facts.length;
  const fact = facts[current];

  return (
    <Pressable
      accessibilityLabel={facts.join('. ')}
      disabled={!rotates}
      onPress={advance}
      style={[styles.capsule, { backgroundColor: theme.backgroundElement }]}>
      {/* Absolutely placed so the outgoing and incoming facts cross-fade in place. */}
      <View style={styles.track}>
        <Animated.View
          key={`${current}:${fact}`}
          entering={reduceMotion ? undefined : FadeIn.duration(250)}
          exiting={reduceMotion ? undefined : FadeOut.duration(150)}
          style={styles.line}>
          <ThemedText
            type="small"
            themeColor="text"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}>
            {fact}
          </ThemedText>
        </Animated.View>
      </View>
      {rotates ? (
        <View style={styles.dots}>
          {facts.map((item, dot) => (
            <View
              key={item}
              style={[
                styles.dot,
                { backgroundColor: dot === current ? theme.text : theme.backgroundSelected },
              ]}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capsule: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    height: HEIGHT,
    borderRadius: PillRadius,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  track: {
    flex: 1,
    alignSelf: 'stretch',
  },
  line: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
});
