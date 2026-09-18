import { ThemedText } from './themed-text';

import { useNow } from '@/hooks/use-now';
import { describeCountdown } from '@/lib/dates';

export type CountdownProps = {
  deadlineAt: number;
};

/** "in 4 hours" above an urgent card's title; renders nothing once the deadline has passed. */
export function Countdown({ deadlineAt }: CountdownProps) {
  const now = useNow();
  const text = describeCountdown(deadlineAt, now);
  if (text === null) return null;

  return (
    <ThemedText type="smallSemibold" themeColor="accent">
      {text}
    </ThemedText>
  );
}
