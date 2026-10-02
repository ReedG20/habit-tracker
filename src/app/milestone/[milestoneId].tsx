import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { RingedHeadline } from '@/components/moments/ringed-headline';
import { openShare } from '@/components/share/open-share';
import { Share03Icon } from '@/constants/icons';
import { ControlHeight, Fonts, PillRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { streakLabel } from '@/convex/lib/milestones';
import type { MilestoneView } from '@/convex/milestones';
import { track } from '@/lib/analytics';
import { watchMilestone } from '@/lib/milestone-screen';
import { formatCents } from '@/lib/money';

/**
 * The page a streak milestone opens (`useMilestonePresenter`): 7 days in a
 * row, 12 weeks… The Kept screen's violet and ring, mid-run instead of at the
 * finish, and Share up front: this is the moment worth posting.
 */

const INK = {
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
  next: 2600,
  actions: 2900,
};

export default function MilestoneScreen() {
  const { milestoneId } = useLocalSearchParams<{ milestoneId: string }>();
  const milestone = useQuery(api.milestones.get, {
    milestoneId: milestoneId as Id<'milestones'>,
  });
  const markSeen = useMutation(api.milestones.markSeen);
  const insets = useSafeAreaInsets();
  useEffect(() => watchMilestone(milestoneId), [milestoneId]);

  const seen = useRef(false);
  const leave = () => {
    track('milestone action', { action: 'done' });
    if (!seen.current && milestone != null) {
      seen.current = true;
      markSeen({ milestoneId: milestone._id }).catch((error: unknown) => {
        console.warn('Could not mark the milestone seen', error);
      });
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Sharing stays on the page: "Keep going" still answers it.
  const share = () => {
    if (milestone == null) return;
    track('milestone action', { action: 'share' });
    openShare({ habitId: milestone.habitId }, 'milestone', 'streak');
  };

  const viewed = useRef(false);
  useEffect(() => {
    if (milestone == null || viewed.current) return;
    viewed.current = true;
    track('milestone viewed', {
      count: milestone.count,
      unit: milestone.unit,
      stake_kind: milestone.stake?.kind ?? 'none',
    });
  }, [milestone]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {milestone === null ? (
        <View style={styles.missing}>
          <Text style={styles.line}>Nothing to see here.</Text>
          <LightButton label="Close" onPress={leave} />
        </View>
      ) : milestone === undefined ? null : (
        <MilestoneBody
          milestone={milestone}
          bottomInset={insets.bottom}
          onShare={share}
          onLeave={leave}
        />
      )}
    </View>
  );
}

/** What it's still keeping safe, said as something that never happened. */
function safeLine(stake: MilestoneView['stake']): { text: string; bold: string | null } {
  if (stake === null || (stake.kind === 'friend' && stake.status === 'void')) {
    return { text: 'All on your word.', bold: null };
  }
  switch (stake.kind) {
    case 'money': {
      const amount = formatCents(stake.amountCents);
      return { text: `${amount} still on your card.`, bold: amount };
    }
    case 'friend':
      return { text: `${stake.friendName} hasn’t heard a thing.`, bold: stake.friendName };
    case 'lockout':
      return { text: 'Not one day locked out.', bold: null };
  }
}

function MilestoneBody({
  milestone,
  bottomInset,
  onShare,
  onLeave,
}: {
  milestone: MilestoneView;
  bottomInset: number;
  onShare: () => void;
  onLeave: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const delay = (ms: number) => (reduceMotion ? 0 : ms);
  const { count, unit, next, title } = milestone;
  const safe = safeLine(milestone.stake);

  return (
    <ScrollView
      contentContainerStyle={[styles.body, { paddingBottom: bottomInset + Spacing.four }]}
      alwaysBounceVertical={false}>
      <Animated.Text entering={FadeIn.delay(delay(BEAT.kicker))} style={styles.kicker}>
        MILESTONE
      </Animated.Text>

      <RingedHeadline
        figure={{ kind: 'count', count, unit: `${unit}s in a row` }}
        color={INK.text}
        beats={BEAT}
        reduceMotion={reduceMotion}
      />

      <View style={styles.lines}>
        <Animated.Text entering={FadeIn.delay(delay(BEAT.line)).duration(500)} style={styles.line}>
          <Text style={styles.bold}>{title}</Text>
          {unit === 'day'
            ? `, ${streakLabel(count, unit)} without missing one.`
            : `, ${streakLabel(count, unit)} without falling short.`}
        </Animated.Text>
        <Animated.Text
          entering={FadeIn.delay(delay(BEAT.stake)).duration(500)}
          style={[styles.line, styles.stakeLine]}>
          {safe.bold === null ? (
            safe.text
          ) : (
            <>
              <Text style={styles.bold}>{safe.bold}</Text>
              {safe.text.slice(safe.bold.length)}
            </>
          )}
        </Animated.Text>
      </View>

      <Animated.View entering={FadeIn.delay(delay(BEAT.next)).duration(500)} style={styles.panel}>
        <Text style={styles.panelText}>
          {next === null
            ? 'That’s the longest one there is. Keep it going.'
            : `Next stop: ${streakLabel(next, unit)}. ${streakLabel(next - count, unit)} to go.`}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(delay(BEAT.actions))} style={styles.actions}>
        <LightButton label="Share it" icon onPress={onShare} />
        <Pressable
          accessibilityRole="button"
          onPress={onLeave}
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Keep going</Text>
        </Pressable>
        <Text style={styles.note}>say it out loud. it gets harder to quit.</Text>
      </Animated.View>
    </ScrollView>
  );
}

/** White on violet: the app's primary button would vanish into this background. */
function LightButton({
  label,
  icon = false,
  onPress,
}: {
  label: string;
  icon?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.lightButton, pressed && styles.pressed]}>
      {icon ? <Icon icon={Share03Icon} size={20} strokeWidth={2} color={INK.background} /> : null}
      <Text style={styles.lightButtonText}>{label}</Text>
    </Pressable>
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
    color: INK.soft,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  lines: {
    gap: Spacing.four,
  },
  line: {
    color: INK.soft,
    fontSize: 20,
    lineHeight: 29,
  },
  stakeLine: {
    color: INK.text,
  },
  bold: {
    color: INK.text,
    fontWeight: '700',
  },
  panel: {
    backgroundColor: INK.panel,
    borderRadius: 24,
    padding: Spacing.four,
  },
  panelText: {
    color: INK.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  actions: {
    marginTop: 'auto',
    gap: Spacing.three,
    paddingTop: Spacing.four,
  },
  lightButton: {
    flexDirection: 'row',
    gap: Spacing.two,
    height: ControlHeight,
    borderRadius: PillRadius,
    backgroundColor: INK.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightButtonText: {
    color: INK.background,
    fontSize: 17,
    fontWeight: '700',
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
    opacity: 0.7,
  },
});
