import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardDetailRow, lowerFirst } from './card-detail-row';
import { HabitActionButton } from './habit-action-button';
import { HabitHistoryStrip } from './habit-history-strip';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import {
  Clock01Icon,
  CoinsDollarIcon,
  FlameIcon,
  HabitIcon,
  LockKeyholeIcon,
  RepeatIcon,
  Tick02Icon,
  UserIcon,
} from '@/constants/icons';
import { formatMinutes, PROOF_METHODS, proofMethodOf } from '@/constants/proof-methods';
import { ActionCardRadius, ControlHeight, Spacing } from '@/constants/theme';
import type { HabitHistory } from '@/convex/habitHistory';
import { frequencyLabel, targetPerWeek } from '@/convex/lib/frequency';
import { describeEnding, isDaily, isWeekDone, type HabitWithProgress } from '@/data/habits';
import { describeHabitStake } from '@/data/stakes';
import { useTheme } from '@/hooks/use-theme';
import { describeWhen, todayKey } from '@/lib/dates';

export type HabitDetailCardProps = {
  habit: HabitWithProgress;
  /** Its recent run; the strip and last attempt wait for it. */
  history?: HabitHistory;
  /** Ante Pro has ended: nothing is checked, so logging leads to the paywall. */
  paused?: boolean;
  now: number;
};

/**
 * A habit on the Commitments tab: Today's card, plus the terms and how it's
 * been going. Today is for logging fast; this is for seeing where each stands.
 */
export function HabitDetailCard({ habit, history, paused = false, now }: HabitDetailCardProps) {
  const theme = useTheme();

  const daily = isDaily(habit);
  const target = targetPerWeek(habit);
  const logged = habit.completedToday || isWeekDone(habit);
  const broken = habit.brokenAt !== undefined;
  const ending = describeEnding(habit, todayKey());
  const method = proofMethodOf(habit);
  const stake = habit.stakeView;
  const stakeLive = stake !== null && (stake.status === 'armed' || stake.status === 'void');
  const open = () => router.push(`/habit/${habit._id}`);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${habit.title}`}
          onPress={open}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
          <View style={[styles.habitIcon, { backgroundColor: theme.background }]}>
            <Icon icon={HabitIcon} size={26} themeColor={logged ? 'textSecondary' : 'text'} />
          </View>
          <View style={styles.body}>
            <ThemedText numberOfLines={2} themeColor={logged ? 'textSecondary' : 'text'}>
              {habit.title}
            </ThemedText>
            <View style={styles.metaRow}>
              {habit.streak > 0 ? (
                <View style={styles.streak}>
                  <Icon icon={FlameIcon} size={16} color={theme.accent} fill={theme.accent} />
                  <ThemedText type="smallSemibold">
                    {habit.streak} {daily ? 'day' : 'week'}
                    {habit.streak === 1 ? '' : 's'}
                  </ThemedText>
                </View>
              ) : null}
              {broken ? (
                <ThemedText type="small" themeColor="accent">
                  Streak lost
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {daily ? 'Every day' : `${habit.weekCount} of ${target} this week`}
                </ThemedText>
              )}
              {ending === null ? null : (
                <ThemedText type="small" themeColor="accent">
                  {ending}
                </ThemedText>
              )}
            </View>
          </View>
        </Pressable>
        <HabitActionButton habit={habit} paused={paused} style={styles.action} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${habit.title}`}
        onPress={open}
        style={({ pressed }) => [styles.details, pressed && styles.pressed]}>
        {history === undefined ? null : <HabitHistoryStrip history={history} target={target} />}

        <View style={styles.rows}>
          <CardDetailRow icon={PROOF_METHODS[method].icon} text={proofLine(habit)} />
          {daily ? null : <CardDetailRow icon={RepeatIcon} text={frequencyLabel(target)} />}
          <CardDetailRow
            icon={stakeIcon(stake)}
            text={describeHabitStake(stake)}
            accent={stakeLive}
          />
          {history === undefined ? null : (
            <CardDetailRow {...lastAttemptLine(history.lastAttempt, now)} icon={Clock01Icon} />
          )}
        </View>
      </Pressable>
    </ThemedView>
  );
}

/** How it gets proved, in the user's words: "Check in at Any gym", "20 min timer". */
function proofLine(habit: HabitWithProgress): string {
  const description = habit.description?.trim() ?? '';
  switch (proofMethodOf(habit)) {
    case 'photo':
      return description.length > 0 ? `Photo of ${lowerFirst(description)}` : 'Photo proof';
    case 'location':
      // "Any gym" reads as "Check in at any gym"; a place's own name keeps its capital.
      return description.length > 0
        ? `Check in at ${/^(Any|A|An|The|My|Some)\b/.test(description) ? lowerFirst(description) : description}`
        : 'Check in';
    case 'timer': {
      const timer = `${formatMinutes(habit.timerMinutes ?? 0)} timer`;
      return description.length > 0 ? `${timer}: ${lowerFirst(description)}` : timer;
    }
  }
}

function stakeIcon(stake: HabitWithProgress['stakeView']) {
  switch (stake?.kind) {
    case 'money':
      return CoinsDollarIcon;
    case 'friend':
      return UserIcon;
    case 'lockout':
      return LockKeyholeIcon;
    default:
      return Tick02Icon;
  }
}

function lastAttemptLine(
  attempt: HabitHistory['lastAttempt'],
  now: number,
): { text: string; detail?: string } {
  if (attempt === null) return { text: 'No attempts yet' };
  const when = describeWhen(attempt.at, now);
  switch (attempt.status) {
    case 'pending':
      return { text: 'Checking your last try…' };
    case 'approved':
      return { text: `Last logged ${when}` };
    case 'rejected':
      return { text: `Last try didn’t count, ${when}`, detail: attempt.reason };
    case 'failed':
      return { text: `Last check failed on our end, ${when}` };
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: ActionCardRadius,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    minWidth: 0,
  },
  // Same height as the button opposite it, and concentric with the card's corner.
  habitIcon: {
    width: ControlHeight,
    height: ControlHeight,
    borderRadius: ActionCardRadius - Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  action: {
    alignSelf: 'flex-start',
  },
  details: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  rows: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
