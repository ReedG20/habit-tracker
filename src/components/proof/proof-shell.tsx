import type { IconSvgElement } from '@hugeicons/react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { PROOF_INK } from './ink';

import { Icon } from '@/components/icon';
import { Cancel01Icon } from '@/constants/icons';
import { PROOF_METHODS, type ProofMethod } from '@/constants/proof-methods';
import { Fonts, PillRadius, Spacing } from '@/constants/theme';

/**
 * The frame every prove screen shares, whatever the method:
 *
 * - top: close on the left, the method chip in the middle, one optional
 *   control on the right (the camera's flash), and the habit's name under it;
 * - stage: full-bleed behind everything (camera feed, radar, timer fill);
 * - bottom: the one thing to do next, with a line of rules above it.
 *
 * Scrims fade the stage under the top and bottom so the chrome stays legible
 * over a bright camera frame.
 */
export type ProofShellProps = {
  method: ProofMethod;
  title: string;
  onClose: () => void;
  /** Hidden while leaving would cost something (a running timer ends through its own button). */
  closeHidden?: boolean;
  right?: ReactNode;
  stage: ReactNode;
  /** Scrims only where the stage can be bright; the camera wants them, the dark stages don't. */
  scrims?: boolean;
  children?: ReactNode;
};

export function ProofShell({
  method,
  title,
  onClose,
  closeHidden = false,
  right,
  stage,
  scrims = false,
  children,
}: ProofShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFill}>{stage}</View>
      {scrims ? (
        <>
          <Scrim edge="top" height={insets.top + 150} />
          <Scrim edge="bottom" height={insets.bottom + 220} />
        </>
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <View style={styles.bar} pointerEvents="box-none">
          <View style={styles.side}>
            {closeHidden ? null : (
              <Animated.View entering={FadeIn} exiting={FadeOut}>
                <CircleButton icon={Cancel01Icon} label="Close" onPress={onClose} />
              </Animated.View>
            )}
          </View>
          <MethodChip method={method} />
          <View style={[styles.side, styles.sideRight]}>{right}</View>
        </View>
        <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
      </View>

      <View style={styles.middle} pointerEvents="none" />

      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.three }]}
        pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

export function MethodChip({ method }: { method: ProofMethod }) {
  const info = PROOF_METHODS[method];
  return (
    <View style={styles.chip} accessibilityLabel={info.chip}>
      <Icon icon={info.icon} size={18} strokeWidth={2} color={PROOF_INK.text} />
      <Text style={styles.chipText}>{info.chip.toUpperCase()}</Text>
    </View>
  );
}

export type CircleButtonProps = {
  icon: IconSvgElement;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** A round translucent control, readable over a camera frame and over the dark stages alike. */
export function CircleButton({
  icon,
  label,
  onPress,
  disabled = false,
  size = 44,
  style,
}: CircleButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={Spacing.two}
      style={({ pressed }) => [
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        (pressed || disabled) && styles.pressed,
        style,
      ]}>
      <Icon icon={icon} size={Math.round(size * 0.5)} strokeWidth={2} color={PROOF_INK.text} />
    </Pressable>
  );
}

/** The quiet second choice under a primary button: "Not now", "End early". */
export function QuietButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.quiet, (pressed || disabled) && styles.pressed]}>
      <Text style={styles.quietText}>{label}</Text>
    </Pressable>
  );
}

/** The line of rules above the bottom action. */
export function RuleText({ children }: { children: ReactNode }) {
  return <Text style={styles.rule}>{children}</Text>;
}

function Scrim({ edge, height }: { edge: 'top' | 'bottom'; height: number }) {
  const id = `scrim-${edge}`;
  return (
    <View
      pointerEvents="none"
      style={[styles.scrim, edge === 'top' ? { top: 0 } : { bottom: 0 }, { height }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0"
              stopColor={PROOF_INK.background}
              stopOpacity={edge === 'top' ? 0.7 : 0}
            />
            <Stop
              offset="1"
              stopColor={PROOF_INK.background}
              stopOpacity={edge === 'top' ? 0 : 0.85}
            />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PROOF_INK.background,
  },
  top: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // As tall as the buttons, so hiding one doesn't shift the chip.
  side: {
    width: 88,
    minHeight: 44,
    flexDirection: 'row',
  },
  sideRight: {
    justifyContent: 'flex-end',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: PillRadius,
    backgroundColor: 'rgba(124,102,255,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124,102,255,0.6)',
  },
  chipText: {
    color: PROOF_INK.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  // Comico sits high in its line box: a roomy one keeps it from clipping.
  title: {
    fontFamily: Fonts.wisdom,
    fontSize: 30,
    lineHeight: 40,
    color: PROOF_INK.text,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 12,
  },
  middle: {
    flex: 1,
  },
  bottom: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PROOF_INK.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  quiet: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  quietText: {
    color: PROOF_INK.soft,
    fontSize: 16,
    fontWeight: '600',
  },
  rule: {
    color: PROOF_INK.soft,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  pressed: {
    opacity: 0.6,
  },
});
