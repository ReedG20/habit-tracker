import { router } from 'expo-router';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ActionButton } from './action-button';
import { Icon } from './icon';

import { LockKeyholeIcon } from '@/constants/icons';
import { PROOF_METHODS, proofMethodOf, proveLabel } from '@/constants/proof-methods';
import { ControlHeight } from '@/constants/theme';
import { isWeekDone, type HabitWithProgress } from '@/data/habits';
import { openPaywall } from '@/lib/paywall';

export type HabitActionButtonProps = {
  habit: HabitWithProgress;
  /**
   * No Ante Pro: nothing is checked, and it can't be logged or restarted. A
   * card shows a quiet lock (its list offers the way back once); the detail
   * screen's full-width button opens the paywall.
   */
  paused?: boolean;
  /** A lockout froze every habit until then: nothing can be logged. */
  frozenUntil?: number;
  /** Full width, for the detail screens. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
};

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

/** A habit card's one action: log it, or why it can't be logged right now. */
export function HabitActionButton({
  habit,
  paused = false,
  frozenUntil,
  fill,
  style,
}: HabitActionButtonProps) {
  const weekDone = isWeekDone(habit);
  const logged = habit.completedToday || weekDone;
  const verifying = !logged && habit.verification?.status === 'pending';

  // Ahead of Restart and Frozen: neither can happen without Pro.
  if (paused) {
    return fill ? (
      <ActionButton
        label="Paused"
        icon={LockKeyholeIcon}
        accessibilityLabel={`${habit.title} is paused. Resubscribe to Ante Pro`}
        onPress={() => openPaywall('habit_detail')}
        fill
        style={style}
      />
    ) : (
      <View
        accessible
        accessibilityLabel={`${habit.title} is paused until Ante Pro is back`}
        style={[styles.lock, style]}>
        <Icon icon={LockKeyholeIcon} size={20} strokeWidth={2} themeColor="textSecondary" />
      </View>
    );
  }
  if (habit.brokenAt !== undefined) {
    return (
      <ActionButton
        label="Restart"
        accessibilityLabel={`Restart ${habit.title}`}
        variant="primary"
        onPress={() => router.navigate(`/restart/${habit._id}`)}
        fill={fill}
        style={style}
      />
    );
  }
  if (frozenUntil !== undefined && !logged) {
    return (
      <ActionButton
        label={`Frozen till ${weekday.format(new Date(frozenUntil + 60 * 60 * 1000))}`}
        accessibilityLabel={`${habit.title} is frozen`}
        disabled
        onPress={() => {}}
        fill={fill}
        style={style}
      />
    );
  }
  if (weekDone) {
    return (
      <ActionButton label="Done this week" disabled onPress={() => {}} fill={fill} style={style} />
    );
  }
  if (logged) {
    return <ActionButton label="Logged" disabled onPress={() => {}} fill={fill} style={style} />;
  }
  if (verifying) {
    return (
      <ActionButton
        label="Verifying…"
        accessibilityLabel={`Verifying ${habit.title}`}
        disabled
        onPress={() => {}}
        fill={fill}
        style={style}
      />
    );
  }
  return (
    <ActionButton
      label={PROOF_METHODS[proofMethodOf(habit)].verb}
      icon={PROOF_METHODS[proofMethodOf(habit)].icon}
      accessibilityLabel={proveLabel(habit)}
      variant="primary"
      // `navigate` rather than `push`: a double tap must not open it twice.
      onPress={() => router.navigate(`/habit/${habit._id}/prove`)}
      fill={fill}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  lock: {
    width: ControlHeight,
    height: ControlHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
