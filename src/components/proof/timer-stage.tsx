import { useEffect, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PROOF_INK } from './ink';
import { ProofResult, type ProofVerdict } from './proof-result';
import { ProofShell, QuietButton, RuleText } from './proof-shell';

import { ActionButton } from '@/components/action-button';
import { formatClock } from '@/constants/proof-methods';
import { Fonts, PillRadius, Spacing } from '@/constants/theme';
import type { Habit } from '@/data/habits';
import { useNow } from '@/hooks/use-now';
import { useProofTimer, type TimerPhase } from '@/hooks/use-proof-timer';
import { endOfDay, todayKey } from '@/lib/dates';
import { pressHaptic, selectionHaptic } from '@/lib/haptics';

const MINUTE_MS = 60 * 1000;
/** The fill rises to full before it starts to drain: the run has begun. */
const RISE_MS = 520;

/**
 * Timer proof. The whole screen becomes the timer: a violet fill that starts
 * full and sinks to the bottom as time runs out. The countdown is drawn twice,
 * white inside the fill and violet above it, so the digits change colour as
 * the edge passes through them.
 */
export function TimerStage({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const { phase, start, stop, retry } = useProofTimer(habit);
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const durationMs = (habit.timerMinutes ?? 0) * MINUTE_MS;

  const level = useSharedValue(0);
  const now = useNow(phase.kind === 'running' ? 250 : 30_000);

  useEffect(() => {
    if (phase.kind === 'running') {
      const remaining = Math.max(0, phase.endsAt - Date.now());
      const drain = withTiming(0, { duration: remaining, easing: Easing.linear });
      if (reduceMotion) {
        level.set(remaining / phase.durationMs);
        level.set(drain);
      } else {
        level.set(
          withSequence(
            withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: Math.max(0, remaining - RISE_MS), easing: Easing.linear }),
          ),
        );
      }
    } else if (phase.kind !== 'starting') {
      // Run out, cut short or reset: the fill drains away under the verdict.
      cancelAnimation(level);
      level.set(withTiming(0, { duration: 450, easing: Easing.in(Easing.quad) }));
    }
  }, [phase, level, reduceMotion]);

  // The fill is a full-height sheet slid down; its contents slide back up by
  // the same amount, so the white digits stay exactly over the violet ones.
  const fill = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - level.get()) * height }],
  }));
  const counter = useAnimatedStyle(() => ({
    transform: [{ translateY: -(1 - level.get()) * height }],
  }));

  const remainingMs =
    phase.kind === 'running'
      ? // `now` can trail the run's start by a tick; never show more than the run.
        Math.max(0, phase.endsAt - Math.max(now, phase.startedAt))
      : phase.kind === 'finishing' || phase.kind === 'done'
        ? 0
        : phase.kind === 'left' || phase.kind === 'stopped'
          ? durationMs - phase.elapsedMs
          : durationMs;

  const running = phase.kind === 'running';
  const face = (tone: Tone) => (
    <TimerFace
      tone={tone}
      clock={formatClock(remainingMs)}
      what={habit.description}
      running={running}
    />
  );

  const stage = (
    <View style={styles.stage}>
      {face('dark')}
      <Animated.View style={[styles.fill, { height }, fill]} pointerEvents="none">
        <View style={styles.edge} />
        <Animated.View style={[StyleSheet.absoluteFill, counter]}>{face('fill')}</Animated.View>
      </Animated.View>
    </View>
  );

  const confirmStop = () => {
    Alert.alert('End the timer?', 'It won’t count, but you can start again right away.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End it', style: 'destructive', onPress: stop },
    ]);
  };

  return (
    <ProofShell
      method="timer"
      title={habit.title}
      onClose={onClose}
      closeHidden={running || phase.kind === 'starting' || phase.kind === 'finishing'}
      stage={stage}>
      <Footer
        phase={phase}
        habit={habit}
        durationMs={durationMs}
        now={now}
        onStart={() => {
          pressHaptic();
          start();
        }}
        onStop={() => {
          selectionHaptic();
          confirmStop();
        }}
        onRetry={retry}
        onClose={onClose}
      />
    </ProofShell>
  );
}

function Footer({
  phase,
  habit,
  durationMs,
  now,
  onStart,
  onStop,
  onRetry,
  onClose,
}: {
  phase: TimerPhase;
  habit: Habit;
  durationMs: number;
  now: number;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const minutes = habit.timerMinutes ?? 0;

  switch (phase.kind) {
    case 'ready':
    case 'starting': {
      // A run never crosses the end of the day at 3 AM (the server refuses), so say so before the tap.
      const tooLate = now + durationMs > endOfDay(todayKey());
      return (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.footer}>
          <View style={styles.rules}>
            <Rule strong>
              Keep Ante open for {minutes === 1 ? '1 minute' : `${minutes} minutes`}.
            </Rule>
            <Rule>Leaving the app stops the timer. No harm done, just start again.</Rule>
          </View>
          {tooLate ? (
            <RuleText>There isn’t enough of today left for this one. It’s back tomorrow.</RuleText>
          ) : (
            <ActionButton
              label={phase.kind === 'starting' ? 'Starting…' : `Start ${formatClock(durationMs)}`}
              variant="primary"
              fill
              disabled={phase.kind === 'starting'}
              onPress={onStart}
            />
          )}
        </Animated.View>
      );
    }
    case 'running':
      return (
        <Animated.View entering={FadeIn.delay(RISE_MS)} exiting={FadeOut} style={styles.running}>
          <QuietButton label="End early" onPress={onStop} />
        </Animated.View>
      );
    case 'finishing':
      return (
        <View style={styles.running}>
          <RuleText>Logging it…</RuleText>
        </View>
      );
    default:
      return (
        <ProofResult
          method="timer"
          habitId={habit._id}
          verdict={verdictFor(phase)}
          onDone={onClose}
          onRetry={onRetry}
          retryLabel={
            phase.kind === 'error' ? (phase.unfinished ? 'Log it' : 'Try again') : 'Start again'
          }
        />
      );
  }
}

function verdictFor(phase: TimerPhase): ProofVerdict {
  switch (phase.kind) {
    case 'done':
      return {
        status: 'approved',
        reason: `You stayed with it for ${minutesLabel(phase.durationMs)}.`,
      };
    case 'left':
      return {
        status: 'rejected',
        reason: `You left Ante ${elapsedLabel(phase.elapsedMs)}, so this one didn’t count. Your streak is safe. Start again whenever you’re ready.`,
      };
    case 'stopped':
      return {
        status: 'rejected',
        reason: `You ended it ${elapsedLabel(phase.elapsedMs)}, so it didn’t count. Start again whenever you’re ready.`,
      };
    case 'error':
      return { status: 'failed', reason: phase.message };
    default:
      return { status: 'failed' };
  }
}

function minutesLabel(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

function elapsedLabel(ms: number): string {
  return ms < MINUTE_MS ? 'in the first minute' : `${minutesLabel(ms)} in`;
}

type Tone = 'dark' | 'fill';

const TONES: Record<Tone, { clock: string; text: string; soft: string; pill: string }> = {
  dark: {
    clock: PROOF_INK.violet,
    text: PROOF_INK.text,
    soft: PROOF_INK.soft,
    pill: 'rgba(124,102,255,0.18)',
  },
  fill: {
    clock: PROOF_INK.text,
    text: PROOF_INK.text,
    soft: 'rgba(255,255,255,0.78)',
    pill: 'rgba(255,255,255,0.16)',
  },
};

/** Everything that sits over the fill, in one tone; drawn once per tone. */
function TimerFace({
  tone,
  clock,
  what,
  running,
}: {
  tone: Tone;
  clock: string;
  what?: string;
  running: boolean;
}) {
  const colors = TONES[tone];
  const { width } = useWindowDimensions();
  const size = Math.min(width * (clock.length > 5 ? 0.2 : 0.27), 128);

  return (
    // Before and after a run the rules fill the bottom, so the clock sits higher.
    <View style={[styles.face, !running && styles.faceRaised]} pointerEvents="none">
      <View style={[styles.pill, { backgroundColor: colors.pill }, !running && styles.hidden]}>
        <LiveDot color={colors.text} />
        <Text style={[styles.pillText, { color: colors.text }]}>KEEP ANTE OPEN</Text>
      </View>
      <Text
        style={[styles.clock, { color: colors.clock, fontSize: size, lineHeight: size * 1.15 }]}
        accessibilityLabel={tone === 'dark' ? `${clock} left` : undefined}
        accessibilityElementsHidden={tone === 'fill'}
        importantForAccessibility={tone === 'fill' ? 'no-hide-descendants' : 'auto'}>
        {clock}
      </Text>
      {what ? (
        <Text style={[styles.what, { color: colors.soft }]} numberOfLines={3}>
          {what}
        </Text>
      ) : null}
    </View>
  );
}

function LiveDot({ color }: { color: string }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(
      withRepeat(withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [reduceMotion, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

function Rule({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <Text style={[styles.rule, strong && styles.ruleStrong]}>{children}</Text>;
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: PROOF_INK.background,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: PROOF_INK.primary,
    overflow: 'hidden',
  },
  // A lit rim along the top of the fill, like the surface of a liquid.
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    backgroundColor: '#9C8BFF',
    zIndex: 1,
  },
  face: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    // Optically centred between the title and the button.
    paddingBottom: Spacing.five,
  },
  faceRaised: {
    paddingBottom: 260,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: PillRadius,
  },
  hidden: {
    opacity: 0,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  clock: {
    fontFamily: Fonts.rounded,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  what: {
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 320,
  },
  footer: {
    gap: Spacing.three,
  },
  rules: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  rule: {
    color: PROOF_INK.soft,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  ruleStrong: {
    color: PROOF_INK.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  running: {
    alignItems: 'center',
    paddingBottom: Spacing.two,
  },
});
