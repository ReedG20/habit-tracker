import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardDetailRow, lowerFirst } from './card-detail-row';
import { Countdown } from './countdown';
import { GoalActionButton } from './goal-action-button';
import { Icon } from './icon';
import { StakePill } from './stake-pill';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { commitmentIcon } from '@/constants/commitment-icons';
import {
  Calendar03Icon,
  Camera01Icon,
  Clock01Icon,
  CoinsDollarIcon,
  Tick02Icon,
  UserIcon,
} from '@/constants/icons';
import { ActionCardRadius, ControlHeight, Spacing } from '@/constants/theme';
import { COUNTDOWN_WINDOW_MS, isMissed, type GoalWithStatus } from '@/data/goals';
import { describeGoalStake } from '@/data/stakes';
import { useTheme } from '@/hooks/use-theme';
import { describeDueAt, describeTimeLeft, formatDueAt, formatShortDate } from '@/lib/dates';

export type GoalDetailCardProps = {
  goal: GoalWithStatus;
  now: number;
};

/**
 * A goal on the Commitments tab: Today's card, plus what the proof has to
 * show, the exact deadline, the stake and how the last submission went.
 */
export function GoalDetailCard({ goal, now }: GoalDetailCardProps) {
  const theme = useTheme();

  const done = goal.completedAt !== undefined;
  const missed = isMissed(goal, now);
  const over = done || missed;
  const countdown = !over && goal.dueAt - now <= COUNTDOWN_WINDOW_MS;
  const stake = goal.stakeView;
  const armed = stake?.status === 'armed';
  // Up by the title, as on Today; the row below then only says what the pill can't.
  const pill = describeGoalStake(stake, 'pill');
  const description = goal.description?.trim() ?? '';
  const submission = over ? null : submissionLine(goal.submission);
  const open = () => router.push(`/goals/${goal._id}`);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${goal.title}`}
          onPress={open}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
          <View style={[styles.goalIcon, { backgroundColor: theme.background }]}>
            <Icon
              icon={commitmentIcon(goal.icon, 'goal')}
              size={26}
              themeColor={over ? 'textSecondary' : 'text'}
            />
          </View>
          <View style={styles.body}>
            {countdown ? <Countdown deadlineAt={goal.dueAt} /> : null}
            <ThemedText numberOfLines={2} themeColor={over ? 'textSecondary' : 'text'}>
              {goal.title}
            </ThemedText>
            <View style={styles.metaRow}>
              <ThemedText type="small" themeColor={missed ? 'accent' : 'textSecondary'}>
                {done
                  ? `Done ${formatShortDate(goal.completedAt ?? now)}`
                  : missed
                    ? describeDueAt(goal.dueAt, now)
                    : describeTimeLeft(goal.dueAt, now)}
              </ThemedText>
              {pill === null ? null : <StakePill text={pill} live={armed && !over} />}
            </View>
          </View>
        </Pressable>
        <GoalActionButton goal={goal} now={now} style={styles.action} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${goal.title}`}
        onPress={open}
        style={({ pressed }) => [styles.rows, pressed && styles.pressed]}>
        {description.length > 0 ? (
          <CardDetailRow icon={Camera01Icon} text={`Photos of ${lowerFirst(description)}`} />
        ) : null}
        <CardDetailRow icon={Calendar03Icon} text={`Due ${formatDueAt(goal.dueAt)}`} />
        {pill === null ? (
          <CardDetailRow
            icon={
              stake?.kind === 'money'
                ? CoinsDollarIcon
                : stake?.kind === 'friend'
                  ? UserIcon
                  : Tick02Icon
            }
            text={describeGoalStake(stake, 'detail') ?? 'Just your word'}
            accent={armed && !over}
          />
        ) : null}
        {submission === null ? null : <CardDetailRow icon={Clock01Icon} {...submission} />}
      </Pressable>
    </ThemedView>
  );
}

function submissionLine(
  submission: GoalWithStatus['submission'],
): { text: string; detail?: string } | null {
  switch (submission?.status) {
    case 'pending':
      return { text: 'Checking your proof…' };
    case 'rejected':
      return { text: 'Last proof didn’t count', detail: submission.reason };
    case 'failed':
      return { text: 'Last check failed on our end. Try again.' };
    default:
      return null;
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
  goalIcon: {
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
  // Wraps like Today's card: the pill drops to its own line beside a wide button.
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  action: {
    alignSelf: 'flex-start',
  },
  rows: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
