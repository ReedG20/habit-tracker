import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { contractBeats, SignedContractCard } from '@/components/signed-contract/signed-contract';
import { Alert02Icon } from '@/constants/icons';
import { Fonts, PillRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { SignedContract } from '@/convex/contracts';
import type { GraceView } from '@/convex/graces';
import { graceStory, type GraceStory } from '@/convex/lib/graceCopy';
import { track, type AnalyticsEvents } from '@/lib/analytics';
import { contactSupport } from '@/lib/support';
import { pressHaptic, selectionHaptic, warningHaptic } from '@/lib/haptics';
import { watchGrace } from '@/lib/grace-screen';

/**
 * The page a first miss opens when it was let go (`convex/lib/grace.ts`): a
 * habit's consequence waived, or a goal's deadline moved 48 hours. It's the
 * only time Ante bends, so the page says so before anything else, styled as
 * a warning rather than a reward: what the miss would have cost, that the
 * stake is still live, and that the next miss counts.
 *
 * Dark, like the loss screen it nearly was, with amber where that one has red.
 */

const INK = {
  background: '#0E0B06',
  panel: '#1D1810',
  text: '#FFFFFF',
  soft: '#BDB3A3',
  faint: '#5C5347',
  accent: '#FFB21F',
  onAccent: '#1A1206',
};

/** Beats, in milliseconds from the screen appearing. */
const BEAT = {
  kicker: 150,
  headline: 450,
  once: 1100,
  line: 1600,
  contract: 2000,
  reasons: 2600,
};

type Reason = AnalyticsEvents['grace reason']['reason'];

const REASONS: { reason: Reason; label: string }[] = [
  { reason: 'forgot', label: 'Forgot' },
  { reason: 'proof', label: 'Proof didn’t work' },
  { reason: 'busy', label: 'Busy day' },
  { reason: 'too_much', label: 'Took on too much' },
];

export default function GraceScreen() {
  const { graceId } = useLocalSearchParams<{ graceId: string }>();
  const grace = useQuery(api.graces.get, { graceId: graceId as Id<'graces'> });
  const contract = useQuery(
    api.contracts.forLoss,
    grace == null ? 'skip' : { stakeId: grace.stakeId },
  );
  const markSeen = useMutation(api.graces.markSeen);
  const insets = useSafeAreaInsets();
  useEffect(() => watchGrace(graceId), [graceId]);

  const seen = useRef(false);
  const leave = (next?: Href) => {
    if (!seen.current && grace != null) {
      seen.current = true;
      markSeen({ graceId: grace.graceId }).catch((error: unknown) => {
        console.warn('Could not mark the reprieve seen', error);
      });
    }
    if (next === undefined) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } else {
      router.replace(next);
    }
  };

  // Fixed when the page opens, so the deadline's wording doesn't shift under the reader.
  const [now] = useState(() => Date.now());
  const story = useMemo(
    () =>
      grace == null
        ? null
        : graceStory({
            kind: grace.kind,
            titles: grace.titles,
            stakes: grace.stakes,
            missedPeriod: grace.missedPeriod,
            weekly: grace.weekly,
            originalDueAt: grace.originalDueAt,
            extendedTo: grace.extendedTo,
            now,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
    [grace, now],
  );

  const viewed = useRef(false);
  useEffect(() => {
    if (grace == null || contract === undefined || viewed.current) return;
    viewed.current = true;
    track('grace viewed', {
      grace_kind: grace.kind,
      stake_kind: grace.stakes[0]?.kind ?? 'none',
      covered: grace.titles.length,
      has_contract: contract !== null,
    });
  }, [grace, contract]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {grace === null ? (
        <View style={styles.missing}>
          <Text style={styles.line}>Nothing to see here.</Text>
          <ActionButton label="Close" variant="primary" onPress={() => leave()} />
        </View>
      ) : grace === undefined || story === null || contract === undefined ? null : (
        <GraceBody
          grace={grace}
          story={story}
          contract={contract}
          now={now}
          bottomInset={insets.bottom}
          onLeave={leave}
        />
      )}
    </View>
  );
}

function GraceBody({
  grace,
  story,
  contract,
  now,
  bottomInset,
  onLeave,
}: {
  grace: GraceView;
  story: GraceStory;
  contract: SignedContract | null;
  now: number;
  bottomInset: number;
  onLeave: (next?: Href) => void;
}) {
  const reduceMotion = useReducedMotion();
  const delay = (ms: number) => (reduceMotion ? 0 : ms);
  const reasonsAt = contract === null ? BEAT.contract : contractBeats(BEAT.contract, false).end;

  useEffect(() => {
    warningHaptic();
  }, []);

  return (
    // No scrolling to the contract, as the loss screen does: the warning at the top is the point.
    <ScrollView
      contentContainerStyle={[styles.body, { paddingBottom: bottomInset + Spacing.four }]}
      alwaysBounceVertical={false}>
      <Animated.Text entering={FadeIn.delay(delay(BEAT.kicker))} style={styles.kicker}>
        {story.kicker.toUpperCase()}
      </Animated.Text>

      <Animated.Text
        entering={FadeInDown.delay(delay(BEAT.headline)).duration(600)}
        style={styles.headline}
        // "This one's on us." fits a line; a goal's new deadline can take two.
        adjustsFontSizeToFit
        numberOfLines={grace.kind === 'waived' ? 1 : 2}>
        {story.headline}
      </Animated.Text>

      <Animated.View
        entering={FadeInDown.delay(delay(BEAT.once)).duration(500)}
        style={styles.once}
        accessible
        accessibilityRole="alert"
        accessibilityLabel={`${story.once.title} ${story.once.body}`}>
        <View style={styles.onceHeading}>
          <Icon icon={Alert02Icon} size={22} strokeWidth={2} color={INK.accent} />
          <Text style={styles.onceTitle}>{story.once.title}</Text>
        </View>
        <Text style={styles.onceBody}>{story.once.body}</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(delay(BEAT.line)).duration(500)}>
        <Emphasized text={story.line} emphasis={story.emphasis} />
      </Animated.View>

      {contract !== null ? (
        <SignedContractCard
          contract={contract}
          stamp={{ label: grace.kind === 'waived' ? 'WAIVED' : 'EXTENDED', color: INK.accent }}
          lead="your signature’s still on it."
          leadColor={INK.soft}
          replay={false}
          at={BEAT.contract}
          reduceMotion={reduceMotion}
          onStamp={pressHaptic}
        />
      ) : null}

      <Animated.View entering={FadeIn.delay(delay(reasonsAt))} style={styles.footer}>
        <Reasons grace={grace} onLeave={onLeave} />
        <Actions grace={grace} now={now} onLeave={onLeave} />
      </Animated.View>
    </ScrollView>
  );
}

/**
 * "What got in the way?", one tap. Each answer is kept, and offers the one
 * thing that would help next time.
 */
function Reasons({ grace, onLeave }: { grace: GraceView; onLeave: (next?: Href) => void }) {
  const setReason = useMutation(api.graces.setReason);
  const [picked, setPicked] = useState<Reason | undefined>(grace.reason);

  const pick = (reason: Reason) => {
    selectionHaptic();
    setPicked(reason);
    track('grace reason', { reason });
    setReason({ graceId: grace.graceId, reason }).catch((error: unknown) => {
      console.warn('Could not save the reason', error);
    });
  };

  const followUp = picked === undefined ? null : helpFor(picked, grace);

  return (
    <View style={styles.reasons}>
      <Text style={styles.reasonsTitle}>What got in the way?</Text>
      <View style={styles.chips}>
        {REASONS.map(({ reason, label }) => {
          const selected = picked === reason;
          return (
            <Pressable
              key={reason}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => pick(reason)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {followUp === null ? null : (
        <Animated.View entering={FadeIn.duration(250)}>
          {followUp.action === null ? (
            <Text style={styles.followUp}>{followUp.label}</Text>
          ) : (
            <Pressable
              accessibilityRole="link"
              hitSlop={Spacing.two}
              onPress={() => {
                const { action, open } = followUp;
                if (action === null) return;
                track('grace action', { action });
                open(onLeave);
              }}
              style={({ pressed }) => pressed && styles.pressed}>
              <Text style={[styles.followUp, styles.followUpLink]}>{followUp.label} →</Text>
            </Pressable>
          )}
        </Animated.View>
      )}
    </View>
  );
}

type FollowUp =
  | { label: string; action: null }
  | {
      label: string;
      action: AnalyticsEvents['grace action']['action'];
      open: (onLeave: (next?: Href) => void) => void;
    };

function helpFor(reason: Reason, grace: GraceView): FollowUp {
  switch (reason) {
    case 'forgot':
      return {
        label: 'Change when we remind you',
        action: 'reminders',
        open: (onLeave) => onLeave('/me/reminders' as Href),
      };
    case 'proof':
      return {
        label: 'Tell us what happened',
        action: 'support',
        open: () => void contactSupport({ subject: 'My proof didn’t work' }),
      };
    case 'too_much':
      return grace.habitId !== undefined && grace.habitExists
        ? {
            label: 'Look at the habit',
            action: 'open_habit',
            open: (onLeave) => onLeave(`/habit/${grace.habitId}` as Href),
          }
        : { label: 'Next time, start smaller. It still counts.', action: null };
    case 'busy':
      return { label: 'It happens. Plan around the next one.', action: null };
  }
}

function Actions({
  grace,
  now,
  onLeave,
}: {
  grace: GraceView;
  now: number;
  onLeave: (next?: Href) => void;
}) {
  const proofOpen =
    grace.kind === 'extended' &&
    grace.goalId !== undefined &&
    !grace.goalDone &&
    (grace.extendedTo ?? 0) > now;

  if (proofOpen) {
    return (
      <View style={styles.actions}>
        <ActionButton
          label="Send proof"
          variant="primary"
          fill
          onPress={() => {
            track('grace action', { action: 'send_proof' });
            onLeave(`/goals/${grace.goalId}/submit` as Href);
          }}
        />
        <Pressable
          accessibilityRole="button"
          hitSlop={Spacing.two}
          onPress={() => {
            track('grace action', { action: 'later' });
            onLeave();
          }}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Later</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      <ActionButton
        label="Got it"
        variant="primary"
        fill
        onPress={() => {
          track('grace action', { action: 'done' });
          onLeave();
        }}
      />
    </View>
  );
}

/** `text` with each term in `emphasis` set in bold, where it first appears. */
function Emphasized({ text, emphasis }: { text: string; emphasis: string[] }) {
  const runs: { text: string; bold: boolean }[] = [];
  let rest = text;
  for (;;) {
    let next: { at: number; term: string } | null = null;
    for (const term of emphasis) {
      const at = term.length === 0 ? -1 : rest.indexOf(term);
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
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  kicker: {
    color: INK.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  // Comico sits high in its line box: a tall box keeps it from clipping.
  headline: {
    fontFamily: Fonts.wisdom,
    fontSize: 40,
    lineHeight: 54,
    color: INK.text,
  },
  once: {
    backgroundColor: INK.panel,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: INK.accent,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  onceHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  onceTitle: {
    color: INK.text,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
  },
  onceBody: {
    color: INK.soft,
    fontSize: 16,
    lineHeight: 23,
  },
  line: {
    color: INK.soft,
    fontSize: 19,
    lineHeight: 27,
  },
  bold: {
    color: INK.text,
    fontWeight: '700',
  },
  footer: {
    marginTop: 'auto',
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  reasons: {
    gap: Spacing.two,
  },
  reasonsTitle: {
    color: INK.text,
    fontSize: 16,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: PillRadius,
    borderWidth: 1,
    borderColor: INK.faint,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: INK.accent,
    borderColor: INK.accent,
  },
  chipText: {
    color: INK.soft,
    fontSize: 15,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: INK.onAccent,
  },
  followUp: {
    color: INK.soft,
    fontSize: 15,
    lineHeight: 21,
    marginTop: Spacing.one,
  },
  followUpLink: {
    color: INK.accent,
    fontWeight: '600',
  },
  actions: {
    gap: Spacing.three,
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
  pressed: {
    opacity: 0.6,
  },
});
