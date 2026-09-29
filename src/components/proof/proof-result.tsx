import { useEffect, useEffectEvent } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { PROOF_INK } from './ink';
import { QuietButton } from './proof-shell';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { Alert02Icon, Cancel01Icon } from '@/constants/icons';
import type { ProofMethod } from '@/constants/proof-methods';
import { CardRadius, Fonts, Spacing } from '@/constants/theme';
import { successHaptic, warningHaptic } from '@/lib/haptics';

export type ProofVerdict = {
  status: 'approved' | 'rejected' | 'failed';
  reason?: string;
};

/** Long enough to read the reason, short enough that it never feels like a wait. */
const AUTO_CLOSE_MS = 2600;

const TITLES: Record<ProofVerdict['status'], Record<ProofMethod, string>> = {
  approved: {
    photo: 'Logged for today.',
    location: 'Checked in.',
    timer: 'Done. Logged.',
  },
  rejected: {
    photo: 'Not quite.',
    location: 'Not here, it seems.',
    timer: 'Timer stopped.',
  },
  failed: {
    photo: 'That one’s on us.',
    location: 'That one’s on us.',
    timer: 'That one’s on us.',
  },
};

const FALLBACK_REASONS: Record<ProofVerdict['status'], string> = {
  approved: 'Done for today. Nice.',
  rejected: 'It didn’t count this time. Give it another go.',
  failed: 'We couldn’t check it. Try again.',
};

export type ProofResultProps = {
  method: ProofMethod;
  verdict: ProofVerdict;
  onDone: () => void;
  onRetry: () => void;
  retryLabel?: string;
  /** Small print under the reason (Google's attribution for a check-in). */
  footnote?: string;
};

/**
 * The verdict, the same for every method: a panel that rises over the stage.
 * An approval draws its check, buzzes, and closes the screen on its own; a
 * rejection is only ever one tap from another go, since it costs nothing.
 */
export function ProofResult({
  method,
  verdict,
  onDone,
  onRetry,
  retryLabel = 'Try again',
  footnote,
}: ProofResultProps) {
  const approved = verdict.status === 'approved';
  // Once per verdict, though the stage hands over a fresh `onDone` each render.
  const close = useEffectEvent(onDone);

  useEffect(() => {
    if (approved) {
      successHaptic();
      const timeout = setTimeout(close, AUTO_CLOSE_MS);
      return () => clearTimeout(timeout);
    }
    warningHaptic();
    return undefined;
  }, [approved]);

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      style={styles.panel}
      accessibilityLiveRegion="polite">
      <View style={styles.head}>
        {approved ? (
          <DrawnCheck />
        ) : (
          <View style={styles.badge}>
            <Icon
              icon={verdict.status === 'failed' ? Alert02Icon : Cancel01Icon}
              size={26}
              strokeWidth={2.25}
              color={PROOF_INK.text}
            />
          </View>
        )}
        <Text style={styles.title}>{TITLES[verdict.status][method]}</Text>
      </View>
      <Text style={styles.reason}>{verdict.reason ?? FALLBACK_REASONS[verdict.status]}</Text>
      {footnote !== undefined ? <Text style={styles.footnote}>{footnote}</Text> : null}

      <View style={styles.actions}>
        {approved ? (
          <ActionButton label="Done" variant="primary" fill onPress={onDone} />
        ) : (
          <>
            <ActionButton label={retryLabel} variant="primary" fill onPress={onRetry} />
            <QuietButton label="Not now" onPress={onDone} />
          </>
        )}
      </View>
    </Animated.View>
  );
}

const CHECK_SIZE = 56;
const RING_LENGTH = Math.PI * (CHECK_SIZE - 4);
const TICK_LENGTH = 34;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The ring closes, then the tick draws in. */
function DrawnCheck() {
  const reduceMotion = useReducedMotion();
  const ring = useSharedValue(reduceMotion ? 1 : 0);
  const tick = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    ring.set(withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    tick.set(withDelay(280, withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) })));
  }, [reduceMotion, ring, tick]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_LENGTH * (1 - ring.get()),
  }));
  const tickProps = useAnimatedProps(() => ({
    strokeDashoffset: TICK_LENGTH * (1 - tick.get()),
  }));

  return (
    <Svg width={CHECK_SIZE} height={CHECK_SIZE} viewBox={`0 0 ${CHECK_SIZE} ${CHECK_SIZE}`}>
      <Circle
        cx={CHECK_SIZE / 2}
        cy={CHECK_SIZE / 2}
        r={CHECK_SIZE / 2 - 2}
        fill={PROOF_INK.primary}
      />
      <AnimatedCircle
        cx={CHECK_SIZE / 2}
        cy={CHECK_SIZE / 2}
        r={CHECK_SIZE / 2 - 2}
        stroke={PROOF_INK.violet}
        strokeWidth={3}
        fill="none"
        strokeDasharray={RING_LENGTH}
        animatedProps={ringProps}
        transform={`rotate(-90 ${CHECK_SIZE / 2} ${CHECK_SIZE / 2})`}
      />
      <AnimatedPath
        d="M17 29 L25 37 L40 21"
        stroke={PROOF_INK.text}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={TICK_LENGTH}
        animatedProps={tickProps}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: PROOF_INK.panel,
    borderColor: PROOF_INK.panelBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: CardRadius,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  badge: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  // Comico sits high in its line box: a roomy one keeps it from clipping.
  title: {
    flex: 1,
    fontFamily: Fonts.wisdom,
    fontSize: 28,
    lineHeight: 38,
    color: PROOF_INK.text,
  },
  reason: {
    color: PROOF_INK.soft,
    fontSize: 17,
    lineHeight: 24,
  },
  footnote: {
    color: PROOF_INK.faint,
    fontSize: 12,
    lineHeight: 16,
  },
  actions: {
    gap: Spacing.one,
    paddingTop: Spacing.one,
  },
});
