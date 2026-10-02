import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { RING_PATH } from '@/constants/ring-path';
import { Fonts, Spacing } from '@/constants/theme';
import { successHaptic } from '@/lib/haptics';

/**
 * The big line on a moment worth marking (the Kept screen, a streak
 * milestone), with a ring drawing itself around it and a buzz as it closes:
 * the loss screen's strike, reversed.
 */

export type RingedFigure =
  { kind: 'count'; count: number; unit: string } | { kind: 'words'; text: string };

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** At least the path's length, so one dash covers the whole loop. */
const RING_DASH = 640;

export function RingedHeadline({
  figure,
  color,
  beats,
  reduceMotion,
  compact = false,
}: {
  figure: RingedFigure;
  color: string;
  /** When each part comes in, in milliseconds from the screen appearing. */
  beats: { headline: number; ring: number; unit: number };
  reduceMotion: boolean;
  /** Smaller, with the unit beside the ring, to leave room below. */
  compact?: boolean;
}) {
  const draw = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      successHaptic();
      return;
    }
    draw.value = withDelay(
      beats.ring,
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(successHaptic);
      }),
    );
  }, [reduceMotion, draw, beats.ring]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_DASH * (1 - draw.value) }));

  const label = figure.kind === 'count' ? `${figure.count} ${figure.unit}` : figure.text;

  return (
    <View
      style={[styles.headlineBlock, compact && styles.headlineRow]}
      accessible
      accessibilityLabel={label}>
      <Animated.View
        entering={FadeInDown.delay(reduceMotion ? 0 : beats.headline).duration(600)}
        style={styles.ringed}>
        <Text
          style={
            figure.kind === 'count'
              ? [styles.count, compact && styles.countCompact, { color }]
              : [styles.words, compact && styles.wordsCompact, { color }]
          }
          numberOfLines={1}>
          {figure.kind === 'count' ? figure.count : figure.text}
        </Text>
        <Svg
          style={styles.ring}
          viewBox="0 0 200 100"
          preserveAspectRatio="none"
          pointerEvents="none">
          <AnimatedPath
            d={RING_PATH}
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={RING_DASH}
            vectorEffect="non-scaling-stroke"
            animatedProps={ringProps}
          />
        </Svg>
      </Animated.View>
      {figure.kind === 'count' ? (
        <Animated.Text
          entering={FadeIn.delay(reduceMotion ? 0 : beats.unit).duration(500)}
          style={[styles.unit, compact && styles.unitCompact, { color }]}>
          {figure.unit}.
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headlineBlock: {
    gap: Spacing.one,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // Sized to the headline, so the ring hugs it.
  ringed: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    // Out into the gutter by less than the padding, so the ring clears the screen edge.
    marginLeft: -Spacing.three,
  },
  ring: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  // Comico sits high in its line box: a tall box keeps the digits from clipping.
  count: {
    fontFamily: Fonts.wisdom,
    fontSize: 120,
    lineHeight: 150,
  },
  words: {
    fontFamily: Fonts.wisdom,
    fontSize: 88,
    lineHeight: 116,
  },
  unit: {
    fontFamily: Fonts.wisdom,
    fontSize: 44,
    lineHeight: 56,
  },
  countCompact: {
    fontSize: 80,
    lineHeight: 100,
  },
  wordsCompact: {
    fontSize: 64,
    lineHeight: 84,
  },
  unitCompact: {
    fontSize: 40,
    lineHeight: 52,
  },
});
