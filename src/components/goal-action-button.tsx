import { router, type Href } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';

import { ActionButton } from './action-button';

import { isMissed, type GoalWithStatus } from '@/data/goals';

export type GoalActionButtonProps = {
  goal: GoalWithStatus;
  now: number;
  /** Where Submit leads; the locked screen has its own proof route. */
  submitHref?: Href;
  /** Full width, for the detail screens. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A goal card's one action: submit proof, or where the goal stands. */
export function GoalActionButton({ goal, now, submitHref, fill, style }: GoalActionButtonProps) {
  const done = goal.completedAt !== undefined;
  const missed = isMissed(goal, now);
  const verifying = !done && !missed && goal.submission?.status === 'pending';

  if (done)
    return <ActionButton label="Done" disabled onPress={() => {}} fill={fill} style={style} />;
  if (missed)
    return <ActionButton label="Missed" disabled onPress={() => {}} fill={fill} style={style} />;
  if (verifying) {
    return (
      <ActionButton
        label="Verifying…"
        accessibilityLabel={`Verifying ${goal.title}`}
        disabled
        onPress={() => {}}
        fill={fill}
        style={style}
      />
    );
  }
  return (
    <ActionButton
      label="Submit"
      accessibilityLabel={`Submit proof for ${goal.title}`}
      variant="primary"
      // `navigate` rather than `push`: a double tap must not stack two screens.
      onPress={() => router.navigate(submitHref ?? `/goals/${goal._id}/submit`)}
      fill={fill}
      style={style}
    />
  );
}
