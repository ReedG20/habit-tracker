import { useEffect, useMemo, type RefObject } from 'react';
import { StyleSheet, Text, View, type ScrollView } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { inkStrokes, signatureBox, type InkStroke } from './ink';
import type { SignedContract } from './types';

import { ReplayMask } from '@/components/replay-mask';
import { Fonts, Spacing } from '@/constants/theme';

/**
 * The contract the user signed, back on paper at the end: the Kept screen
 * stamps it kept, the loss screen stamps it missed. The one light, paper
 * object on either screen, so it reads as the real document, with their own
 * signature on it.
 */

const PAPER = {
  background: '#FBF8F1',
  ink: '#1A1614',
  body: '#4A423D',
  soft: '#8A7F78',
};

const SIGNATURE_HEIGHT = 56;
/** How long the signature takes to write itself again, whatever its length. */
const REPLAY_MS = 1100;
const STAMP_MS = 200;

const signedDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** Beats, in milliseconds from the screen appearing, for a contract that enters at `at`. */
export function contractBeats(at: number, replay: boolean) {
  const sign = at + 500;
  const stamp = replay ? sign + REPLAY_MS + 250 : at + 700;
  return { sign, stamp, end: stamp + STAMP_MS + 300 };
}

/** "today", "yesterday", "34 days ago": how long ago it was signed, for the line above the contract. */
export function signedAgo(signedAt: number, at: number): string {
  const day = (time: number) => {
    const date = new Date(time);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };
  const days = Math.round((day(at) - day(signedAt)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * The contract lands near the end of a long page, below the fold on most
 * phones: scroll down to it as it enters, so the stamp lands in view.
 */
export function useRevealContract(
  scroll: RefObject<ScrollView | null>,
  at: number,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), at);
    return () => clearTimeout(timer);
  }, [scroll, at, enabled]);
}

export type SignedContractCardProps = {
  contract: SignedContract;
  /** The rubber stamp across the signature. */
  stamp: { label: string; color: string };
  /** A handwritten line above the paper. */
  lead: string;
  leadColor: string;
  /** Write the signature out again, stroke by stroke, before the stamp lands. */
  replay: boolean;
  /** When the contract enters, in milliseconds from the screen appearing. */
  at: number;
  reduceMotion: boolean;
  /** Fires as the stamp lands. Keep it stable: a new one restarts the beats. */
  onStamp?: () => void;
};

export function SignedContractCard({
  contract,
  stamp,
  lead,
  leadColor,
  replay,
  at,
  reduceMotion,
  onStamp,
}: SignedContractCardProps) {
  const beats = contractBeats(at, replay);
  const stampAt = beats.stamp;
  const delay = (ms: number) => (reduceMotion ? 0 : ms);

  const landed = useSharedValue(reduceMotion ? 1 : 0);
  const thump = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    landed.value = withDelay(
      stampAt,
      withTiming(1, { duration: STAMP_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished && onStamp !== undefined) scheduleOnRN(onStamp);
      }),
    );
    // The paper gives a little under the stamp.
    thump.value = withDelay(
      stampAt + STAMP_MS,
      withSequence(withTiming(1, { duration: 50 }), withTiming(0, { duration: 220 })),
    );
  }, [reduceMotion, stampAt, onStamp, landed, thump]);

  const stampStyle = useAnimatedStyle(() => ({
    opacity: landed.value * 0.9,
    transform: [{ rotate: '-12deg' }, { scale: 1.8 - 0.8 * landed.value }],
  }));
  const paperStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: '-1.5deg' }, { scale: 1 - 0.012 * thump.value }],
  }));

  const heading = contract.kind === 'habit' ? 'Standing agreement' : 'Agreement';

  return (
    <View style={styles.block}>
      <Animated.Text
        entering={FadeIn.delay(delay(at)).duration(500)}
        style={[styles.lead, { color: leadColor }]}>
        {lead}
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(delay(at)).duration(600)}>
        <Animated.View style={[styles.paper, paperStyle]}>
          <Text style={styles.heading}>
            {heading.toUpperCase()} · {signedDate.format(contract.signedAt).toUpperCase()}
          </Text>

          <Text style={styles.terms}>
            {contract.terms.map((run, index) => (
              <Text key={index} style={run.strong === true ? styles.strong : undefined}>
                {run.text}
              </Text>
            ))}
          </Text>

          <View style={styles.signatureArea}>
            {/* Their signature, kept out of session replays as it was when they drew it. */}
            <ReplayMask>
              <Signature
                contract={contract}
                replay={replay && !reduceMotion}
                startAt={beats.sign}
              />
            </ReplayMask>
            <View style={styles.rule} />
            <Text style={styles.caption}>Your signature</Text>
          </View>

          <Animated.View
            pointerEvents="none"
            style={[styles.stamp, { borderColor: stamp.color }, stampStyle]}
            accessible
            accessibilityLabel={stamp.label}>
            <Text style={[styles.stampText, { color: stamp.color }]}>{stamp.label}</Text>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The stored strokes, fitted to the line; `replay` writes them out again in order. */
function Signature({
  contract,
  replay,
  startAt,
}: {
  contract: SignedContract;
  replay: boolean;
  startAt: number;
}) {
  const strokes = useMemo(() => inkStrokes(contract.signature.strokes), [contract]);
  const box = useMemo(() => signatureBox(strokes, contract.signature), [strokes, contract]);
  const total = strokes.reduce((sum, stroke) => sum + stroke.length, 0);

  const progress = useSharedValue(replay ? 0 : 1);
  useEffect(() => {
    if (!replay) return;
    progress.value = withDelay(
      startAt,
      withTiming(1, { duration: REPLAY_MS, easing: Easing.inOut(Easing.quad) }),
    );
  }, [replay, startAt, progress]);

  return (
    <Svg
      width="100%"
      height={SIGNATURE_HEIGHT}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMinYMax meet"
      accessibilityLabel="Your signature">
      {strokes.map((stroke, index) => (
        <InkPath key={index} stroke={stroke} total={total} progress={progress} />
      ))}
    </Svg>
  );
}

function InkPath({
  stroke,
  total,
  progress,
}: {
  stroke: InkStroke;
  total: number;
  progress: SharedValue<number>;
}) {
  // One dash a little longer than the stroke, slid in as the pen reaches it.
  const dash = stroke.length + 1;
  const animatedProps = useAnimatedProps(() => {
    const drawn = progress.value * total - stroke.start;
    const shown = Math.min(Math.max(drawn / Math.max(stroke.length, 0.1), 0), 1);
    return {
      strokeDashoffset: dash * (1 - shown),
      strokeOpacity: drawn > 0 ? 1 : 0,
    };
  });

  return (
    <AnimatedPath
      d={stroke.d}
      stroke={PAPER.ink}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      strokeDasharray={[dash, dash]}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  lead: {
    fontFamily: Fonts.note,
    fontSize: 20,
    lineHeight: 28,
  },
  paper: {
    backgroundColor: PAPER.background,
    borderRadius: 20,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three + Spacing.one,
    gap: Spacing.two + Spacing.one,
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
  },
  heading: {
    color: PAPER.soft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  terms: {
    fontFamily: Fonts.serif,
    color: PAPER.body,
    fontSize: 18,
    lineHeight: 26,
  },
  strong: {
    color: PAPER.ink,
    fontWeight: '700',
  },
  signatureArea: {
    marginTop: Spacing.one,
  },
  rule: {
    height: 1,
    backgroundColor: PAPER.ink,
    opacity: 0.25,
    marginTop: Spacing.one,
  },
  caption: {
    color: PAPER.soft,
    fontSize: 13,
    marginTop: Spacing.one,
  },
  // Across the signature's far end, the way a stamp half covers what it approves.
  stamp: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.five,
    borderWidth: 3,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    backgroundColor: 'transparent',
  },
  // Comico sits high in its line box: a tall box keeps it from clipping.
  stampText: {
    fontFamily: Fonts.wisdom,
    fontSize: 30,
    lineHeight: 40,
    letterSpacing: 1,
  },
});
