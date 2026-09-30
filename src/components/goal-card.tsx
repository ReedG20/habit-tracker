import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Countdown } from './countdown';
import { GoalActionButton } from './goal-action-button';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { GoalListIcon } from '@/constants/icons';
import { ActionCardRadius, ControlHeight, PillRadius, Spacing } from '@/constants/theme';
import { COUNTDOWN_WINDOW_MS, isMissed, type GoalWithStatus } from '@/data/goals';
import { describeGoalStake } from '@/data/stakes';
import { useTheme } from '@/hooks/use-theme';
import { describeDueAt } from '@/lib/dates';

export type GoalCardProps = {
  goal: GoalWithStatus;
  now: number;
  /** Where the card itself leads; `null` makes it inert (the locked screen has no detail view). */
  detailHref?: Href | null;
  /** Where Submit leads; the locked screen has its own proof route. */
  submitHref?: Href;
};

export function GoalCard({ goal, now, detailHref, submitHref }: GoalCardProps) {
  const theme = useTheme();

  const done = goal.completedAt !== undefined;
  const missed = isMissed(goal, now);
  const over = done || missed;
  const countdown = !over && goal.dueAt - now <= COUNTDOWN_WINDOW_MS;
  const stake = describeGoalStake(goal.stakeView, 'pill');
  const armed = goal.stakeView?.status === 'armed';
  const detail = detailHref === undefined ? (`/goals/${goal._id}` as const) : detailHref;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        accessibilityRole={detail === null ? undefined : 'button'}
        accessibilityLabel={detail === null ? undefined : `Open ${goal.title}`}
        disabled={detail === null}
        onPress={detail === null ? undefined : () => router.push(detail)}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={[styles.goalIcon, { backgroundColor: theme.background }]}>
          <Icon icon={GoalListIcon} size={26} themeColor={over ? 'textSecondary' : 'text'} />
        </View>

        <View style={styles.body}>
          {countdown ? <Countdown deadlineAt={goal.dueAt} /> : null}
          <ThemedText numberOfLines={1} themeColor={over ? 'textSecondary' : 'text'}>
            {goal.title}
          </ThemedText>

          <View style={styles.metaRow}>
            <ThemedText
              type="small"
              themeColor={missed ? 'accent' : 'textSecondary'}
              numberOfLines={1}
              style={styles.deadline}>
              {done ? 'Done' : describeDueAt(goal.dueAt, now)}
            </ThemedText>
            {stake !== null ? (
              <View
                style={[
                  styles.stakePill,
                  {
                    backgroundColor: armed ? theme.accentElement : theme.background,
                  },
                ]}>
                <ThemedText type="smallSemibold" themeColor={armed ? 'accent' : 'textSecondary'}>
                  {stake}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      <GoalActionButton goal={goal} now={now} submitHref={submitHref} style={styles.action} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.three,
    borderRadius: ActionCardRadius,
    padding: Spacing.three,
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  deadline: {
    flexShrink: 1,
  },
  stakePill: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: PillRadius,
  },
  action: {
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.7,
  },
});
