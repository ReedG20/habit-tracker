import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { Countdown } from './countdown';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { GoalListIcon } from '@/constants/icons';
import { ActionCardRadius, ButtonHeight, PillRadius, Spacing } from '@/constants/theme';
import { COUNTDOWN_WINDOW_MS, isMissed, type GoalWithStatus } from '@/data/goals';
import { useTheme } from '@/hooks/use-theme';
import { describeDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

export type GoalCardProps = {
  goal: GoalWithStatus;
  now: number;
};

/** The one-word state of the money on a goal, for the pill next to the deadline. */
function describeStake(goal: GoalWithStatus): string | null {
  const { stake } = goal;
  if (stake === undefined) return null;

  const amount = formatCents(stake.amountCents);
  switch (stake.status) {
    case 'charged':
      return `Charged ${amount}`;
    case 'refunded':
      return `${amount} · refunded`;
    case 'disputed':
      return `${amount} · disputed`;
    case 'charge_failed':
      return `${amount} · charge failed`;
    case 'released':
      return `${amount} · safe`;
    default:
      return `${amount} on it`;
  }
}

export function GoalCard({ goal, now }: GoalCardProps) {
  const theme = useTheme();

  const done = goal.completedAt !== undefined;
  const missed = isMissed(goal, now);
  const over = done || missed;
  const verifying = !over && goal.submission?.status === 'pending';
  const countdown = !over && goal.dueAt - now <= COUNTDOWN_WINDOW_MS;
  const stake = describeStake(goal);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${goal.title}`}
        onPress={() => router.push(`/goals/${goal._id}`)}
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
                    backgroundColor:
                      goal.stake?.status === 'armed' ? theme.accentElement : theme.background,
                  },
                ]}>
                <ThemedText
                  type="smallSemibold"
                  themeColor={goal.stake?.status === 'armed' ? 'accent' : 'textSecondary'}>
                  {stake}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      {done ? (
        <ActionButton label="Done" disabled onPress={() => {}} style={styles.action} />
      ) : missed ? (
        <ActionButton label="Missed" disabled onPress={() => {}} style={styles.action} />
      ) : verifying ? (
        <ActionButton
          label="Verifying…"
          accessibilityLabel={`Verifying ${goal.title}`}
          disabled
          onPress={() => {}}
          style={styles.action}
        />
      ) : (
        <ActionButton
          label="Submit"
          accessibilityLabel={`Submit proof for ${goal.title}`}
          variant="primary"
          // `navigate` rather than `push`: a double tap must not stack two screens.
          onPress={() => router.navigate(`/goals/${goal._id}/submit`)}
          style={styles.action}
        />
      )}
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
    width: ButtonHeight,
    height: ButtonHeight,
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
