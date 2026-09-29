import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { Countdown } from '@/components/countdown';
import { Icon } from '@/components/icon';
import { Cancel01Icon, Tick02Icon } from '@/constants/icons';
import { Fonts, PillRadius, Spacing } from '@/constants/theme';
import type { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import type { Loss } from '@/convex/stakes';
import { lossStory, textFriendBody, type LossStory } from '@/data/loss-story';
import { useSettleUp } from '@/hooks/use-settle-up';
import { lossHaptic, successHaptic } from '@/lib/haptics';
import { cardLabel, formatCents } from '@/lib/money';

/**
 * The page a lost stake opens: shown on its own the next time the app is up
 * (`useLossPresenter`), or from the push. It lands in beats: what was lost,
 * struck through and drained; what happened, in one plain sentence; what the
 * stake bought while it held; and the way back in, one tap from here.
 *
 * Always dark, whatever the system setting: this is the one screen in Ante
 * that should feel like the lights went down.
 */

const INK = {
  background: '#0E0706',
  panel: '#1C1110',
  text: '#FFFFFF',
  soft: '#B9ABA7',
  faint: '#5C4B47',
  accent: '#FF391F',
  violet: '#7C66FF',
};

/** Beats, in milliseconds from the screen appearing. */
const BEAT = {
  kicker: 150,
  strike: 700,
  drain: 1100,
  gone: 2000,
  line: 2300,
  bought: 2800,
  actions: 3300,
};

export default function LostScreen() {
  const { stakeId } = useLocalSearchParams<{ stakeId: string }>();
  const loss = useQuery(api.stakes.loss, { stakeId: stakeId as Id<'stakes'> });
  const markSeen = useMutation(api.stakes.markSeen);
  const insets = useSafeAreaInsets();

  const seen = useRef(false);
  const leave = (next?: Href) => {
    if (!seen.current && loss != null) {
      seen.current = true;
      markSeen({ stakeId: loss.stake._id }).catch((error: unknown) => {
        console.warn('Could not mark the loss seen', error);
      });
    }
    if (next === undefined) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } else {
      router.replace(next);
    }
  };

  const story = loss == null ? null : lossStory(loss);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {loss === null ? (
        <View style={styles.missing}>
          <Text style={styles.line}>This one’s gone.</Text>
          <ActionButton label="Close" variant="primary" onPress={() => leave()} />
        </View>
      ) : loss === undefined || story === null ? null : (
        <LossBody loss={loss} story={story} bottomInset={insets.bottom} onLeave={leave} />
      )}
    </View>
  );
}

function LossBody({
  loss,
  story,
  bottomInset,
  onLeave,
}: {
  loss: Loss;
  story: LossStory;
  bottomInset: number;
  onLeave: (next?: Href) => void;
}) {
  const reduceMotion = useReducedMotion();
  const delay = (ms: number) => (reduceMotion ? 0 : ms);

  useEffect(() => {
    lossHaptic();
  }, []);

  return (
    <ScrollView
      contentContainerStyle={[styles.body, { paddingBottom: bottomInset + Spacing.four }]}
      alwaysBounceVertical={false}>
      <Animated.Text entering={FadeIn.delay(delay(BEAT.kicker))} style={styles.kicker}>
        {story.kicker.toUpperCase()}
      </Animated.Text>

      {story.headline.kind === 'money' ? (
        <DrainingAmount
          cents={story.headline.cents}
          gone={story.gone}
          reduceMotion={reduceMotion}
        />
      ) : (
        <Animated.Text
          entering={FadeInDown.delay(delay(BEAT.strike)).duration(600)}
          style={styles.words}
          adjustsFontSizeToFit
          numberOfLines={1}>
          {story.headline.text}
        </Animated.Text>
      )}

      <Animated.View entering={FadeIn.delay(delay(BEAT.line)).duration(500)}>
        <Emphasized text={story.line} emphasis={story.emphasis} />
      </Animated.View>

      {loss.stake.kind === 'lockout' && loss.frozenUntil !== undefined ? (
        <Animated.View entering={FadeIn.delay(delay(BEAT.line))} style={styles.countdown}>
          <Countdown deadlineAt={loss.frozenUntil} />
        </Animated.View>
      ) : null}

      {story.bought !== null ? (
        <Animated.View
          entering={FadeInDown.delay(delay(BEAT.bought)).duration(500)}
          style={styles.panel}>
          <RunDots count={story.bought.count} unit={story.bought.unit} />
          <Text style={styles.panelTitle}>{story.bought.title}</Text>
          <Text style={styles.panelBody}>{story.bought.body}</Text>
        </Animated.View>
      ) : null}

      {loss.stake.kind === 'friend' ? (
        <Animated.View
          entering={FadeInDown.delay(delay(BEAT.bought)).duration(500)}
          style={styles.panel}>
          <Text style={styles.panelTitle}>What {loss.stake.friendName} got</Text>
          <Text style={styles.panelBody}>
            One email saying you missed, with a nudge to check in on you. If they reply, it comes
            straight to you.
          </Text>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeIn.delay(delay(BEAT.actions))} style={styles.actions}>
        <Actions loss={loss} onLeave={onLeave} />
        <Text style={styles.note}>{story.note}</Text>
      </Animated.View>
    </ScrollView>
  );
}

/**
 * The amount, then a hand-drawn strike across it, then it drains to nothing
 * and "Gone." takes its place. A declined card skips the drain: nothing left.
 */
function DrainingAmount({
  cents,
  gone,
  reduceMotion,
}: {
  cents: number;
  gone: boolean;
  reduceMotion: boolean;
}) {
  const strike = useSharedValue(reduceMotion ? 1 : 0);
  const fade = useSharedValue(1);
  const [shown, setShown] = useState(reduceMotion && gone ? 0 : cents);

  useEffect(() => {
    if (reduceMotion) return;
    strike.value = withDelay(
      BEAT.strike,
      withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
    if (!gone) return;
    fade.value = withDelay(BEAT.drain, withTiming(0.35, { duration: 900 }));

    let frame = 0;
    const timer = setTimeout(() => {
      const start = performance.now();
      const step = () => {
        const progress = Math.min(1, (performance.now() - start) / 900);
        const eased = progress ** 2;
        setShown(Math.round(cents * (1 - eased)));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, BEAT.drain);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [cents, gone, reduceMotion, strike, fade]);

  const strikeStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: strike.value }] }));
  const amountStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <View
      style={styles.amountBlock}
      accessible
      accessibilityLabel={`${formatCents(cents)} ${gone ? 'lost' : 'owed'}`}>
      <View>
        <Animated.Text style={[styles.amount, amountStyle]} numberOfLines={1}>
          {formatCents(shown)}
        </Animated.Text>
        <Animated.View style={[styles.strike, strikeStyle]} />
      </View>
      {gone ? (
        <Animated.Text
          entering={FadeIn.delay(reduceMotion ? 0 : BEAT.gone).duration(500)}
          style={styles.gone}>
          Gone.
        </Animated.Text>
      ) : (
        <Animated.Text
          entering={FadeIn.delay(reduceMotion ? 0 : BEAT.gone).duration(500)}
          style={styles.gone}>
          Still owed.
        </Animated.Text>
      )}
    </View>
  );
}

/** The run the stake held up, a dot a day (or week), ending in the miss. */
function RunDots({ count, unit }: { count: number; unit: 'day' | 'week' }) {
  const MAX = 42;
  const shown = Math.min(count, MAX);
  return (
    <View
      style={styles.dots}
      accessible
      accessibilityLabel={`${count} ${unit}${count === 1 ? '' : 's'} in a row, then a miss`}>
      {count > MAX ? <Text style={styles.more}>+{count - MAX}</Text> : null}
      {Array.from({ length: shown }, (_, index) => (
        <View key={index} style={[styles.dot, { backgroundColor: INK.violet }]}>
          <Icon icon={Tick02Icon} size={10} strokeWidth={3} color={INK.text} />
        </View>
      ))}
      <View style={[styles.dot, { backgroundColor: INK.accent }]}>
        <Icon icon={Cancel01Icon} size={10} strokeWidth={3} color={INK.text} />
      </View>
    </View>
  );
}

/** The way back in, which depends on what was lost and whether it can be restarted. */
function Actions({ loss, onLeave }: { loss: Loss; onLeave: (next?: Href) => void }) {
  const settleUp = useSettleUp();
  const [busy, setBusy] = useState(false);
  const { stake } = loss;
  const restartable = loss.habitId !== undefined && loss.habitExists;
  const restartHref = (again: boolean): Href =>
    `/restart/${loss.habitId}${again ? `?again=${stake._id}` : ''}` as Href;

  const secondary = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );

  if (stake.kind === 'money' && stake.status === 'charge_failed') {
    const pay = async () => {
      if (busy) return;
      setBusy(true);
      try {
        const result = await settleUp.settle(stake._id);
        if (result === 'canceled') return;
        successHaptic();
        if (result === 'pending') {
          Alert.alert('Payment received', 'It can take a minute to show up here.');
        }
      } catch (error: unknown) {
        Alert.alert(
          'That didn’t go through',
          error instanceof Error ? error.message : 'Try another card.',
        );
      } finally {
        setBusy(false);
      }
    };
    return (
      <>
        {settleUp.supported ? (
          <ActionButton
            label={busy ? 'Opening…' : `Pay ${formatCents(stake.amountCents)} now`}
            variant="primary"
            fill
            disabled={busy}
            onPress={() => void pay()}
          />
        ) : null}
        {secondary('Not now', () => onLeave())}
      </>
    );
  }

  if (loss.goalId !== undefined && loss.habitId === undefined) {
    return (
      <>
        <ActionButton
          label="Set it again"
          variant="primary"
          fill
          onPress={() => onLeave(`/new?kind=goal&again=${stake._id}` as Href)}
        />
        {secondary('Not now', () => onLeave())}
      </>
    );
  }

  if (!restartable) {
    return <ActionButton label="Done" variant="primary" fill onPress={() => onLeave()} />;
  }

  if (stake.kind === 'money') {
    const again =
      stake.cardLast4 === undefined
        ? `Go again · ${formatCents(stake.amountCents)} on it`
        : `Go again · ${formatCents(stake.amountCents)} on ${cardLabel(stake)}`;
    return (
      <>
        <ActionButton
          label={again}
          variant="primary"
          fill
          onPress={() => onLeave(restartHref(true))}
        />
        {secondary('Change the stakes', () => onLeave(restartHref(false)))}
        {secondary('Not now', () => onLeave())}
      </>
    );
  }

  if (stake.kind === 'friend') {
    const name = stake.friendName;
    return (
      <>
        <ActionButton
          label={`Text ${name} yourself`}
          variant="primary"
          fill
          onPress={() => {
            void Linking.openURL(`sms:&body=${encodeURIComponent(textFriendBody(loss.title))}`);
          }}
        />
        {secondary(`Restart ${loss.title}`, () => onLeave(restartHref(true)))}
        {secondary('Not now', () => onLeave())}
      </>
    );
  }

  return (
    <>
      <ActionButton
        label={`Restart ${loss.title}`}
        variant="primary"
        fill
        onPress={() => onLeave(restartHref(true))}
      />
      {secondary('Not now', () => onLeave())}
    </>
  );
}

/** `text` with each term in `emphasis` set in bold, where it first appears. */
function Emphasized({ text, emphasis }: { text: string; emphasis: string[] }) {
  const runs: { text: string; bold: boolean }[] = [];
  let rest = text;
  for (;;) {
    let next: { at: number; term: string } | null = null;
    for (const term of emphasis) {
      const at = rest.indexOf(term);
      if (at >= 0 && (next === null || at < next.at)) next = { at, term };
    }
    if (next === null) break;
    if (next.at > 0) runs.push({ text: rest.slice(0, next.at), bold: false });
    runs.push({ text: next.term, bold: true });
    rest = rest.slice(next.at + next.term.length);
  }
  if (rest.length > 0) runs.push({ text: rest, bold: false });

  return (
    <Text style={styles.line}>
      {runs.map((run, index) => (
        <Text key={index} style={run.bold ? styles.bold : undefined}>
          {run.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: INK.background,
  },
  missing: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.four,
  },
  kicker: {
    color: INK.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  amountBlock: {
    gap: Spacing.one,
  },
  // Comico sits high in its line box: a tall box keeps the digits from clipping.
  amount: {
    fontFamily: Fonts.wisdom,
    fontSize: 120,
    lineHeight: 150,
    color: INK.text,
    alignSelf: 'flex-start',
  },
  strike: {
    position: 'absolute',
    left: -Spacing.two,
    right: -Spacing.two,
    top: '52%',
    height: 10,
    borderRadius: PillRadius,
    backgroundColor: INK.accent,
    transform: [{ rotate: '-7deg' }],
    transformOrigin: 'left',
  },
  gone: {
    fontFamily: Fonts.wisdom,
    fontSize: 44,
    lineHeight: 56,
    color: INK.text,
  },
  words: {
    fontFamily: Fonts.wisdom,
    fontSize: 72,
    lineHeight: 96,
    color: INK.text,
  },
  line: {
    color: INK.soft,
    fontSize: 20,
    lineHeight: 29,
  },
  bold: {
    color: INK.text,
    fontWeight: '700',
  },
  countdown: {
    alignSelf: 'flex-start',
  },
  panel: {
    backgroundColor: INK.panel,
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  panelTitle: {
    color: INK.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  panelBody: {
    color: INK.soft,
    fontSize: 16,
    lineHeight: 23,
  },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.two,
    alignItems: 'center',
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: PillRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: {
    color: INK.soft,
    fontSize: 13,
    fontWeight: '600',
    marginRight: Spacing.one,
  },
  actions: {
    marginTop: 'auto',
    gap: Spacing.three,
    paddingTop: Spacing.four,
  },
  secondary: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  secondaryText: {
    color: INK.soft,
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    fontFamily: Fonts.note,
    fontSize: 19,
    lineHeight: 28,
    color: INK.soft,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
});
