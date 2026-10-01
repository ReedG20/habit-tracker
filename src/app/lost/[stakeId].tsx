import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import {
  contractBeats,
  SignedContractCard,
  useRevealContract,
} from '@/components/signed-contract/signed-contract';
import { Cancel01Icon, Tick02Icon } from '@/constants/icons';
import { Fonts, PillRadius, Spacing } from '@/constants/theme';
import type { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import type { SignedContract } from '@/convex/contracts';
import { useFitsScreen } from '@/hooks/use-fits-screen';
import type { Loss } from '@/convex/stakes';
import { lossStory, textFriendBody, type LossStory } from '@/data/loss-story';
import { useSettleUp } from '@/hooks/use-settle-up';
import { captureError, track, type AnalyticsEvents } from '@/lib/analytics';
import { lossHaptic, pressHaptic, successHaptic } from '@/lib/haptics';
import { watchLoss } from '@/lib/loss-screen';
import { cardLabel, formatCents } from '@/lib/money';
import { userErrorMessage } from '@/lib/user-errors';

/**
 * The page a lost stake opens: shown on its own the next time the app is up
 * (`useLossPresenter`), or from the push. It lands in beats: what was lost,
 * struck through and dimmed; what happened, in one plain sentence; what the
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
  dim: 1100,
  gone: 2000,
  line: 2300,
  bought: 2800,
  /** The signed contract, when there is one; the actions wait for its stamp. */
  contract: 3100,
  actions: 3300,
};

export default function LostScreen() {
  const { stakeId } = useLocalSearchParams<{ stakeId: string }>();
  const loss = useQuery(api.stakes.loss, { stakeId: stakeId as Id<'stakes'> });
  const contract = useQuery(api.contracts.forLoss, { stakeId: stakeId as Id<'stakes'> });
  const markSeen = useMutation(api.stakes.markSeen);
  const insets = useSafeAreaInsets();
  useEffect(() => watchLoss(stakeId), [stakeId]);

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

  const viewed = useRef(false);
  useEffect(() => {
    if (loss == null || contract === undefined || viewed.current) return;
    viewed.current = true;
    track('stake lost viewed', {
      kind: loss.habitId !== undefined ? 'habit' : 'goal',
      stake_kind: loss.stake.kind,
      stake_status: loss.stake.status,
      amount_cents: loss.stake.kind === 'money' ? loss.stake.amountCents : 0,
      has_contract: contract !== null,
    });
  }, [loss, contract]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {loss === null ? (
        <View style={styles.missing}>
          <Text style={styles.line}>This one’s gone.</Text>
          <ActionButton label="Close" variant="primary" onPress={() => leave()} />
        </View>
      ) : loss === undefined || story === null || contract === undefined ? null : (
        <LossBody
          loss={loss}
          story={story}
          contract={contract}
          bottomInset={insets.bottom}
          onLeave={leave}
        />
      )}
    </View>
  );
}

function LossBody({
  loss,
  story,
  contract,
  bottomInset,
  onLeave,
}: {
  loss: Loss;
  story: LossStory;
  contract: SignedContract | null;
  bottomInset: number;
  onLeave: (next?: Href) => void;
}) {
  const reduceMotion = useReducedMotion();
  const delay = (ms: number) => (reduceMotion ? 0 : ms);
  const actionsAt = contract === null ? BEAT.actions : contractBeats(BEAT.contract, false).end;
  // With the contract to show, the page tightens up to stay on one screen.
  const compact = contract !== null;
  // Extras, most important first: the run the stake bought, then what the friend got.
  const fit = useFitsScreen(compact, 2);
  const scroll = useRef<ScrollView>(null);
  useRevealContract(scroll, BEAT.contract, compact && !reduceMotion);

  useEffect(() => {
    lossHaptic();
  }, []);

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={[
        styles.body,
        compact && styles.bodyCompact,
        { paddingBottom: bottomInset + (compact ? Spacing.three : Spacing.four) },
      ]}
      alwaysBounceVertical={false}
      {...fit.scrollProps}>
      <Animated.Text entering={FadeIn.delay(delay(BEAT.kicker))} style={styles.kicker}>
        {story.kicker.toUpperCase()}
      </Animated.Text>

      {story.headline.kind === 'money' ? (
        <StruckAmount
          cents={story.headline.cents}
          gone={story.gone}
          reduceMotion={reduceMotion}
          compact={compact}
        />
      ) : (
        <Animated.Text
          entering={FadeInDown.delay(delay(BEAT.strike)).duration(600)}
          style={[styles.words, compact && styles.wordsCompact]}
          adjustsFontSizeToFit
          numberOfLines={1}>
          {story.headline.text}
        </Animated.Text>
      )}

      <Animated.View entering={FadeIn.delay(delay(BEAT.line)).duration(500)}>
        <Emphasized text={story.line} emphasis={story.emphasis} compact={compact} />
      </Animated.View>

      {loss.stake.kind === 'lockout' && loss.frozenUntil !== undefined ? (
        <Animated.View entering={FadeIn.delay(delay(BEAT.line))} style={styles.countdown}>
          <Countdown deadlineAt={loss.frozenUntil} />
        </Animated.View>
      ) : null}

      {story.bought !== null && fit.shows(0) ? (
        <Animated.View
          entering={FadeInDown.delay(delay(BEAT.bought)).duration(500)}
          style={[styles.panel, compact && styles.panelCompact]}>
          <RunDots count={story.bought.count} unit={story.bought.unit} compact={compact} />
          <Text style={[styles.panelTitle, compact && styles.panelTitleCompact]}>
            {story.bought.title}
          </Text>
          {compact ? null : <Text style={styles.panelBody}>{story.bought.body}</Text>}
        </Animated.View>
      ) : null}

      {loss.stake.kind === 'friend' && fit.shows(1) ? (
        <Animated.View
          entering={FadeInDown.delay(delay(BEAT.bought)).duration(500)}
          style={[styles.panel, compact && styles.panelCompact]}>
          <Text style={[styles.panelTitle, compact && styles.panelTitleCompact]}>
            What {loss.stake.friendName} got
          </Text>
          <Text style={styles.panelBody}>
            One email saying you missed, with a nudge to check in on you.
            {compact ? null : ' If they reply, it comes straight to you.'}
          </Text>
        </Animated.View>
      ) : null}

      {contract !== null ? (
        <SignedContractCard
          contract={contract}
          stamp={{ label: 'MISSED', color: INK.accent }}
          lead="your signature’s still on it."
          leadColor={INK.soft}
          replay={false}
          at={BEAT.contract}
          reduceMotion={reduceMotion}
          onStamp={pressHaptic}
        />
      ) : null}

      <Animated.View
        entering={FadeIn.delay(delay(actionsAt))}
        style={[styles.actions, compact && styles.actionsCompact]}>
        <Actions loss={loss} onLeave={onLeave} compact={compact} />
        {/* The line over the contract says it now. */}
        {compact ? null : <Text style={styles.note}>{story.note}</Text>}
      </Animated.View>
    </ScrollView>
  );
}

/**
 * The amount, then a hand-drawn strike across it as it dims, then "Gone."
 * under it. A declined card is struck too, but it's still owed.
 */
function StruckAmount({
  cents,
  gone,
  reduceMotion,
  compact,
}: {
  cents: number;
  gone: boolean;
  reduceMotion: boolean;
  /** Smaller, with "Gone." beside the amount, to leave room for the contract. */
  compact: boolean;
}) {
  const strike = useSharedValue(reduceMotion ? 1 : 0);
  const fade = useSharedValue(reduceMotion ? 0.4 : 1);

  useEffect(() => {
    if (reduceMotion) return;
    strike.value = withDelay(
      BEAT.strike,
      withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
    fade.value = withDelay(BEAT.dim, withTiming(0.4, { duration: 900 }));
  }, [reduceMotion, strike, fade]);

  const strikeStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: strike.value }] }));
  const amountStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <View
      style={[styles.amountBlock, compact && styles.amountRow]}
      accessible
      accessibilityLabel={`${formatCents(cents)} ${gone ? 'lost' : 'still owed'}`}>
      <View style={styles.struck}>
        <Animated.Text
          style={[styles.amount, compact && styles.amountCompact, amountStyle]}
          numberOfLines={1}>
          {formatCents(cents)}
        </Animated.Text>
        <Animated.View style={[styles.strike, strikeStyle]} />
      </View>
      <Animated.Text
        entering={FadeIn.delay(reduceMotion ? 0 : BEAT.gone).duration(500)}
        style={[styles.gone, compact && styles.goneCompact]}>
        {gone ? 'Gone.' : 'Still owed.'}
      </Animated.Text>
    </View>
  );
}

/** The run the stake held up, a dot a day (or week), ending in the miss. */
function RunDots({
  count,
  unit,
  compact = false,
}: {
  count: number;
  unit: 'day' | 'week';
  /** One row, the latest few, to leave room for the contract. */
  compact?: boolean;
}) {
  const MAX = compact ? 10 : 42;
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
function Actions({
  loss,
  onLeave,
  compact,
}: {
  loss: Loss;
  onLeave: (next?: Href) => void;
  /** The quieter ways out side by side, to save a row. */
  compact: boolean;
}) {
  const settleUp = useSettleUp();
  const [busy, setBusy] = useState(false);
  const { stake } = loss;
  const restartable = loss.habitId !== undefined && loss.habitExists;
  const restartHref = (again: boolean): Href =>
    `/restart/${loss.habitId}${again ? `?again=${stake._id}` : ''}` as Href;
  const leave = (action: AnalyticsEvents['stake lost action']['action'], next?: Href) => {
    track('stake lost action', { action });
    onLeave(next);
  };

  const secondary = (label: string, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
  const links = (...items: ReactNode[]) =>
    compact ? <View style={styles.links}>{items}</View> : <>{items}</>;

  if (stake.kind === 'money' && stake.status === 'charge_failed') {
    const pay = async () => {
      if (busy) return;
      setBusy(true);
      track('stake lost action', { action: 'pay' });
      try {
        const result = await settleUp.settle(stake._id);
        track('stake settled', { result });
        if (result === 'canceled') return;
        successHaptic();
        if (result === 'pending') {
          Alert.alert('Payment received', 'It can take a minute to show up here.');
        }
      } catch (error: unknown) {
        captureError(error, 'settle up');
        Alert.alert('That didn’t go through', userErrorMessage(error, 'Try another card.'));
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
        {secondary('Not now', () => leave('not_now'))}
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
          onPress={() => leave('redo', `/new?kind=goal&again=${stake._id}` as Href)}
        />
        {secondary('Not now', () => leave('not_now'))}
      </>
    );
  }

  if (!restartable) {
    return <ActionButton label="Done" variant="primary" fill onPress={() => leave('done')} />;
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
          onPress={() => leave('go_again', restartHref(true))}
        />
        {links(
          secondary('Change the stakes', () => leave('change_stakes', restartHref(false))),
          secondary('Not now', () => leave('not_now')),
        )}
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
            track('stake lost action', { action: 'text_friend' });
            void Linking.openURL(`sms:&body=${encodeURIComponent(textFriendBody(loss.title))}`);
          }}
        />
        {links(
          secondary(`Restart ${loss.title}`, () => leave('restart', restartHref(true))),
          secondary('Not now', () => leave('not_now')),
        )}
      </>
    );
  }

  return (
    <>
      <ActionButton
        label={`Restart ${loss.title}`}
        variant="primary"
        fill
        onPress={() => leave('restart', restartHref(true))}
      />
      {secondary('Not now', () => leave('not_now'))}
    </>
  );
}

/** `text` with each term in `emphasis` set in bold, where it first appears. */
function Emphasized({
  text,
  emphasis,
  compact,
}: {
  text: string;
  emphasis: string[];
  compact: boolean;
}) {
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
    <Text style={[styles.line, compact && styles.lineCompact]}>
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
  bodyCompact: {
    paddingTop: Spacing.three,
    gap: Spacing.three,
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
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  // Sized to the number, so the strike runs just past its edges.
  struck: {
    alignSelf: 'flex-start',
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
  amountCompact: {
    fontSize: 80,
    lineHeight: 100,
  },
  // Wraps under itself, rather than off the edge, beside a wide amount.
  goneCompact: {
    flexShrink: 1,
    fontSize: 36,
    lineHeight: 46,
  },
  wordsCompact: {
    fontSize: 56,
    lineHeight: 74,
  },
  line: {
    color: INK.soft,
    fontSize: 20,
    lineHeight: 29,
  },
  lineCompact: {
    fontSize: 18,
    lineHeight: 26,
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
  panelCompact: {
    paddingVertical: Spacing.three,
    gap: 0,
  },
  panelTitleCompact: {
    fontSize: 20,
    lineHeight: 26,
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
  actionsCompact: {
    paddingTop: Spacing.two,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: Spacing.five,
    rowGap: Spacing.two,
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
