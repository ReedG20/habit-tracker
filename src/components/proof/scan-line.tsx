import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, G, Line, LinearGradient, Pattern, Rect, Stop } from 'react-native-svg';

import { PROOF_INK } from './ink';

/** How tall the glow trailing the beam is. */
const TRAIL = 140;
const SWEEP_MS = 1700;
const GRID = 28;

/**
 * "Checking" over a still photo: a faint grid settles over the frame, and a
 * violet beam sweeps top to bottom with a soft trail behind it, again and
 * again, the way a scanner reads a page. It fades in at the top and out at the
 * bottom so the restart never jumps. Reduced motion keeps the grid and a
 * steady glow.
 */
export function ScanLine() {
  const reduceMotion = useReducedMotion();
  const [height, setHeight] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || height === 0) return;
    // From the top every time: a repeat loops from wherever it started.
    progress.set(0);
    progress.set(
      withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1),
    );
  }, [reduceMotion, height, progress]);

  const beam = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.1, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ translateY: progress.get() * height - TRAIL }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <G opacity={0.16}>
              <Line x1={0} y1={0} x2={GRID} y2={0} stroke={PROOF_INK.violet} strokeWidth={1} />
              <Line x1={0} y1={0} x2={0} y2={GRID} stroke={PROOF_INK.violet} strokeWidth={1} />
            </G>
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grid)" />
      </Svg>

      {reduceMotion ? (
        <View style={[StyleSheet.absoluteFill, styles.steady]} />
      ) : (
        <Animated.View style={[styles.beam, beam]}>
          <Svg width="100%" height={TRAIL + 2}>
            <Defs>
              <LinearGradient id="trail" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={PROOF_INK.violet} stopOpacity={0} />
                <Stop offset="1" stopColor={PROOF_INK.violet} stopOpacity={0.45} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height={TRAIL} fill="url(#trail)" />
            <Rect y={TRAIL - 1} width="100%" height={3} fill="#D9D1FF" />
          </Svg>
        </Animated.View>
      )}

      <Corners />
    </Animated.View>
  );
}

/** Viewfinder brackets in the corners: the frame is being read, not just shown. */
function Corners() {
  return (
    <View style={styles.corners} pointerEvents="none">
      <View style={[styles.corner, styles.topLeft]} />
      <View style={[styles.corner, styles.topRight]} />
      <View style={[styles.corner, styles.bottomLeft]} />
      <View style={[styles.corner, styles.bottomRight]} />
    </View>
  );
}

const CORNER = 28;
const INSET = 24;

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(7,6,15,0.28)',
  },
  steady: {
    backgroundColor: 'rgba(124,102,255,0.14)',
  },
  beam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  corners: {
    position: 'absolute',
    left: INSET,
    right: INSET,
    // Clear of the title above and the caption below.
    top: INSET * 8,
    bottom: INSET * 9,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#D9D1FF',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 10,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 10,
  },
});
