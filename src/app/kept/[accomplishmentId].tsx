import type { IconSvgElement } from '@hugeicons/react-native';
import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { RingedHeadline } from '@/components/moments/ringed-headline';
import { openShare } from '@/components/share/open-share';
import {
  contractBeats,
  SignedContractCard,
  signedAgo,
  useRevealContract,
} from '@/components/signed-contract/signed-contract';
import { Flag02Icon, RepeatIcon, Share03Icon, Tick02Icon } from '@/constants/icons';
import { ControlHeight, Fonts, PillRadius, Spacing } from '@/constants/theme';
import type { Kept } from '@/convex/accomplishments';
import type { SignedContract } from '@/convex/contracts';
import type { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import { raiseOptions } from '@/convex/lib/stakeLadder';
import { useFitsScreen } from '@/hooks/use-fits-screen';
import { keptStory, type KeptStory } from '@/data/kept-story';
import { track } from '@/lib/analytics';
import { pressHaptic } from '@/lib/haptics';
import { watchKept } from '@/lib/kept-screen';

/**
 * The page a commitment seen through opens (`useKeptPresenter`): a staked
 * habit kept right to the end of its notice, or a goal proven. The loss
 * screen's mirror image: where that one strikes the amount out in the dark,
 * this one rings the run in the app's own violet, and says what never had to
 * happen because of it.
 */

const KEPT = {
  background: '#4121FF',
  panel: 'rgba(255, 255, 255, 0.12)',
  text: '#FFFFFF',
  soft: 'rgba(255, 255, 255, 0.78)',
};

/** Beats, in milliseconds from the screen appearing. */
const BEAT = {
  kicker: 150,
  headline: 400,
  ring: 900,
  unit: 1300,
  line: 1800,
  stake: 2200,
  run: 2600,
  /** The signed contract, when there is one; the actions wait for its stamp. */
  contract: 3000,
  actions: 3100,
};

export default function KeptScreen() {
  const { accomplishmentId } = useLocalSearchParams<{ accomplishmentId: string }>();
  const kept = useQuery(api.accomplishments.get, {
    accomplishmentId: accomplishmentId as Id<'accomplishments'>,
  });
  const contract = useQuery(api.contracts.forKept, {
    accomplishmentId: accomplishmentId as Id<'accomplishments'>,
  });
  const markSeen = useMutation(api.accomplishments.markSeen);
  const insets = useSafeAreaInsets();
  useEffect(() => watchKept(accomplishmentId), [accomplishmentId]);

  const seen = useRef(false);
  const leave = (action: LeaveAction, next?: Href) => {
    track('kept action', { action });
    if (!seen.current && kept != null) {
      seen.current = true;
      markSeen({ accomplishmentId: kept._id }).catch((error: unknown) => {
        console.warn('Could not mark the accomplishment seen', error);
      });
    }
    if (next === undefined) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } else {
      router.replace(next);
    }
  };

  // Sharing stays on the page: Done still answers it.
  const share = () => {
    track('kept action', { action: 'share' });
    openShare({ accomplishmentId: accomplishmentId as Id<'accomplishments'> }, 'kept', 'kept');
  };

  const viewed = useRef(false);
  useEffect(() => {
    if (kept == null || contract === undefined || viewed.current) return;
    viewed.current = true;
    track('kept viewed', {
      kind: kept.kind,
      stake_kind: kept.stake?.kind ?? 'none',
      has_contract: contract !== null,
    });
  }, [kept, contract]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {kept === null ? (
        <View style={styles.missing}>
          <Text style={styles.line}>Nothing to see here.</Text>
          <LightButton label="Close" onPress={() => leave('done')} />
        </View>
      ) : kept === undefined || contract === undefined ? null : (
        <KeptBody
          kept={kept}
          story={keptStory(kept)}
          contract={contract}
          bottomInset={insets.bottom}
          onLeave={leave}
          onShare={share}
        />
      )}
    </View>
  );
}

type LeaveAction = 'done' | 'start_another' | 'go_again' | 'go_again_higher';

function KeptBody({
  kept,
  story,
  contract,
  bottomInset,
  onLeave,
  onShare,
}: {
  kept: Kept;
  story: KeptStory;
  contract: SignedContract | null;
  bottomInset: number;
  onLeave: (action: LeaveAction, next?: Href) => void;
  onShare: () => void;
}) {
  const goAgain = `/new?from=${kept._id}`;
  // Nowhere higher to go once it's already the most money a stake can be.
  const canRaise = raiseOptions(kept.stake, kept.kind).canRaise;
  const reduceMotion = useReducedMotion();
  const delay = (ms: number) => (reduceMotion ? 0 : ms);
  const actionsAt = contract === null ? BEAT.actions : contractBeats(BEAT.contract, true).end;
  // With the contract to show, the page tightens up to stay on one screen.
  const compact = contract !== null;
  const fit = useFitsScreen(compact, 1);
  const scroll = useRef<ScrollView>(null);
  useRevealContract(scroll, BEAT.contract, compact && !reduceMotion);

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

      <RingedHeadline
        figure={story.headline}
        color={KEPT.text}
        beats={BEAT}
        reduceMotion={reduceMotion}
        compact={compact}
      />

      <View style={compact ? styles.linesCompact : styles.lines}>
        <Animated.View entering={FadeIn.delay(delay(BEAT.line)).duration(500)}>
          <Emphasized
            text={story.line}
            emphasis={story.emphasis}
            style={compact && styles.lineCompact}
          />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(delay(BEAT.stake)).duration(500)}>
          <Emphasized
            text={story.stakeLine}
            emphasis={story.emphasis}
            style={[styles.stakeLine, compact && styles.lineCompact]}
          />
        </Animated.View>
      </View>

      {story.dots !== null && fit.shows(0) ? (
        <Animated.View
          entering={FadeInDown.delay(delay(BEAT.run)).duration(500)}
          style={[styles.panel, compact && styles.panelCompact]}>
          <RunDots count={story.dots.count} unit={story.dots.unit} compact={compact} />
        </Animated.View>
      ) : null}

      {contract !== null ? (
        <SignedContractCard
          contract={contract}
          stamp={{ label: 'KEPT', color: KEPT.background }}
          lead={`you signed this ${signedAgo(contract.signedAt, kept.achievedAt)}. you kept it.`}
          leadColor={KEPT.text}
          replay
          at={BEAT.contract}
          reduceMotion={reduceMotion}
          onStamp={pressHaptic}
        />
      ) : null}

      <Animated.View
        entering={FadeIn.delay(delay(actionsAt))}
        style={[styles.actions, compact && styles.actionsCompact]}>
        <View style={styles.buttons}>
          <View style={styles.button}>
            <LightButton label="Share" icon={Share03Icon} quiet onPress={onShare} />
          </View>
          <View style={styles.button}>
            <LightButton
              label="Go again"
              icon={RepeatIcon}
              onPress={() => onLeave('go_again', goAgain as Href)}
            />
          </View>
        </View>
        <View style={styles.links}>
          <TextLink label="Done" onPress={() => onLeave('done')} />
          {canRaise ? (
            <TextLink
              label="Go again, higher"
              onPress={() => onLeave('go_again_higher', `${goAgain}&higher=1` as Href)}
            />
          ) : (
            <TextLink
              label={kept.kind === 'goal' ? 'Set another goal' : 'Start another habit'}
              onPress={() => onLeave('start_another', `/new?kind=${kept.kind}` as Href)}
            />
          )}
        </View>
        {/* The line over the contract says it now. */}
        {compact ? null : <Text style={styles.note}>{story.note}</Text>}
      </Animated.View>
    </ScrollView>
  );
}

/** The run, a tick a day (or week), finished with a flag instead of the loss screen's miss. */
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
      accessibilityLabel={`${count} ${unit}${count === 1 ? '' : 's'} in a row, to the finish`}>
      {count > MAX ? <Text style={styles.more}>+{count - MAX}</Text> : null}
      {Array.from({ length: shown }, (_, index) => (
        <View key={index} style={[styles.dot, { backgroundColor: KEPT.panel }]}>
          <Icon icon={Tick02Icon} size={10} strokeWidth={3} color={KEPT.text} />
        </View>
      ))}
      <View style={[styles.dot, { backgroundColor: KEPT.text }]}>
        <Icon icon={Flag02Icon} size={11} strokeWidth={2.5} color={KEPT.background} />
      </View>
    </View>
  );
}

/**
 * White on violet: the app's primary button would vanish into this background.
 * `quiet` sets it on the panel tint instead, for the action beside the main one.
 */
function LightButton({
  label,
  icon,
  quiet = false,
  onPress,
}: {
  label: string;
  icon?: IconSvgElement;
  quiet?: boolean;
  onPress: () => void;
}) {
  const color = quiet ? KEPT.text : KEPT.background;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.lightButton,
        quiet && styles.lightButtonQuiet,
        pressed && styles.pressed,
      ]}>
      {icon === undefined ? null : <Icon icon={icon} size={20} strokeWidth={2} color={color} />}
      <Text style={[styles.lightButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** A quiet action under the buttons. */
function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

/** `text` with each term in `emphasis` set in bold, where it first appears. */
function Emphasized({
  text,
  emphasis,
  style,
}: {
  text: string;
  emphasis: string[];
  style?: StyleProp<TextStyle>;
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
    <Text style={[styles.line, style]}>
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
    backgroundColor: KEPT.background,
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
  lines: {
    gap: Spacing.four,
  },
  linesCompact: {
    gap: Spacing.two,
  },
  kicker: {
    color: KEPT.soft,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  line: {
    color: KEPT.soft,
    fontSize: 20,
    lineHeight: 29,
  },
  stakeLine: {
    color: KEPT.text,
  },
  lineCompact: {
    fontSize: 18,
    lineHeight: 26,
  },
  bold: {
    color: KEPT.text,
    fontWeight: '700',
  },
  panel: {
    backgroundColor: KEPT.panel,
    borderRadius: 24,
    padding: Spacing.four,
  },
  panelCompact: {
    paddingVertical: Spacing.three,
  },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    color: KEPT.soft,
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
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
  },
  lightButton: {
    flexDirection: 'row',
    gap: Spacing.two,
    height: ControlHeight,
    borderRadius: PillRadius,
    backgroundColor: KEPT.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightButtonQuiet: {
    backgroundColor: KEPT.panel,
  },
  lightButtonText: {
    color: KEPT.background,
    fontSize: 17,
    fontWeight: '700',
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.five,
  },
  secondary: {
    paddingVertical: Spacing.one,
  },
  secondaryText: {
    color: KEPT.soft,
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    fontFamily: Fonts.note,
    fontSize: 19,
    lineHeight: 28,
    color: KEPT.soft,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
