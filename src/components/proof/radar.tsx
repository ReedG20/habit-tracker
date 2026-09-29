import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { PROOF_INK } from './ink';

/**
 * - `idle`: waiting for the tap; the dot breathes.
 * - `locating`: asking the phone where it is; ripples leave the dot.
 * - `scanning`: looking at what's around; a beam sweeps the rings.
 * - `settled`: a verdict is in; everything holds still.
 */
export type RadarMode = 'idle' | 'locating' | 'scanning' | 'settled';

const RIPPLE_MS = 1800;
const SWEEP_MS = 2200;

/** The location stage: you at the centre, the neighbourhood in rings around you. */
export function Radar({ size, mode }: { size: number; mode: RadarMode }) {
  const reduceMotion = useReducedMotion();
  const half = size / 2;

  const breathe = useSharedValue(0);
  const rippleA = useSharedValue(0);
  const rippleB = useSharedValue(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    breathe.set(
      withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [reduceMotion, breathe]);

  useEffect(() => {
    if (reduceMotion || mode !== 'locating') {
      cancelAnimation(rippleA);
      cancelAnimation(rippleB);
      rippleA.set(0);
      rippleB.set(0);
      return;
    }
    const ripple = withRepeat(
      withTiming(1, { duration: RIPPLE_MS, easing: Easing.out(Easing.cubic) }),
      -1,
    );
    rippleA.set(ripple);
    rippleB.set(withDelay(RIPPLE_MS / 2, ripple));
  }, [reduceMotion, mode, rippleA, rippleB]);

  useEffect(() => {
    if (reduceMotion || mode !== 'scanning') {
      cancelAnimation(sweep);
      return;
    }
    sweep.set(0);
    sweep.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }), -1));
  }, [reduceMotion, mode, sweep]);

  const halo = useAnimatedStyle(() => ({
    opacity: 0.35 + breathe.get() * 0.35,
    transform: [{ scale: 1 + breathe.get() * 0.25 }],
  }));
  const beam = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.get() * 360}deg` }],
  }));

  // The sweep: a wedge that fades behind its leading edge.
  const wedgeAngle = (40 * Math.PI) / 180;
  const wedge = `M ${half} ${half} L ${half} 0 A ${half} ${half} 0 0 0 ${
    half - half * Math.sin(wedgeAngle)
  } ${half - half * Math.cos(wedgeAngle)} Z`;

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <G opacity={mode === 'settled' ? 0.5 : 1}>
          {[1, 2 / 3, 1 / 3].map((fraction) => (
            <Circle
              key={fraction}
              cx={half}
              cy={half}
              r={half * fraction - 1}
              stroke={PROOF_INK.violet}
              strokeOpacity={0.28}
              strokeWidth={1}
              fill="none"
            />
          ))}
          <Line
            x1={half}
            y1={4}
            x2={half}
            y2={size - 4}
            stroke={PROOF_INK.violet}
            strokeOpacity={0.12}
          />
          <Line
            x1={4}
            y1={half}
            x2={size - 4}
            y2={half}
            stroke={PROOF_INK.violet}
            strokeOpacity={0.12}
          />
        </G>
      </Svg>

      <Ripple progress={rippleA} size={size} />
      <Ripple progress={rippleB} size={size} />

      {mode === 'scanning' ? (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(300)}
          style={[StyleSheet.absoluteFill, beam]}>
          <Svg width={size} height={size}>
            <Defs>
              <LinearGradient id="wedge" x1="1" y1="0" x2="0" y2="0.4">
                <Stop offset="0" stopColor={PROOF_INK.violet} stopOpacity={0.55} />
                <Stop offset="1" stopColor={PROOF_INK.violet} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={wedge} fill="url(#wedge)" />
            <Line
              x1={half}
              y1={half}
              x2={half}
              y2={0}
              stroke="#D9D1FF"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
      ) : null}

      <View style={[styles.center, { left: half - 36, top: half - 36 }]}>
        <Animated.View style={[styles.halo, halo]} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

function Ripple({ progress, size }: { progress: SharedValue<number>; size: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.get() === 0 ? 0 : 0.7 * (1 - progress.get()),
    transform: [{ scale: 0.08 + progress.get() * 0.92 }],
  }));
  return (
    <Animated.View
      style={[styles.ripple, { width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(124,102,255,0.35)',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PROOF_INK.violet,
    borderWidth: 3,
    borderColor: PROOF_INK.text,
  },
  ripple: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 2,
    borderColor: PROOF_INK.violet,
  },
});
