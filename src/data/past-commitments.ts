import type { EndedHabitView } from '@/convex/endedHabits';
import type { StakeView } from '@/convex/lib/stakeRules';
import { isGoalOver, type GoalWithStatus } from '@/data/goals';
import { freezeLength } from '@/data/stakes';
import { formatCents } from '@/lib/money';

export type { EndedHabitView };

/** `endedAt` is when it left the live list: proven, missed, or deleted. */
export type PastItem =
  | { kind: 'goal'; goal: GoalWithStatus; endedAt: number }
  | { kind: 'habit'; habit: EndedHabitView; endedAt: number };

/**
 * Commitments that are over, newest first: goals done or missed, and habits
 * deleted (`endedHabits.list`). The live lists never show them; this is the
 * only place they stay.
 */
export function pastCommitments(
  goals: GoalWithStatus[],
  endedHabits: EndedHabitView[],
  now: number,
): PastItem[] {
  const items: PastItem[] = [
    ...goals
      .filter((goal) => isGoalOver(goal, now))
      .map((goal) => ({ kind: 'goal' as const, goal, endedAt: goal.completedAt ?? goal.dueAt })),
    ...endedHabits.map((habit) => ({ kind: 'habit' as const, habit, endedAt: habit.endedAt })),
  ];
  return items.sort((a, b) => b.endedAt - a.endedAt);
}

/**
 * What a Past row says about its stake. Money gets its own column, the
 * amount and how it ended ("$25 lost"), so it reads at a glance down the list;
 * a friend or a freeze rides on the status line. `null` when there's nothing
 * worth saying: their word, a lock let go, a friend who opted out.
 */
export type PastStakeTag =
  | {
      kind: 'money';
      amount: string;
      label: string;
      tone: 'lost' | 'kept' | 'quiet';
      struck: boolean;
    }
  | { kind: 'phrase'; phrase: string };

export function pastStakeTag(stake: StakeView | null): PastStakeTag | null {
  if (stake === null) return null;
  switch (stake.kind) {
    case 'money': {
      const amount = formatCents(stake.amountCents);
      const money = (label: string, tone: 'lost' | 'kept' | 'quiet', struck = false) =>
        ({ kind: 'money', amount, label, tone, struck }) as const;
      switch (stake.status) {
        case 'armed':
          return money('due', 'lost');
        case 'charging':
          return money('charging', 'lost');
        case 'charged':
          return money('lost', 'lost', true);
        case 'disputed':
          return money('disputed', 'lost', true);
        case 'charge_failed':
          return money('unpaid', 'lost');
        case 'released':
          return money('kept', 'kept');
        case 'refunded':
          return money('refunded', 'quiet', true);
      }
      break;
    }
    case 'friend': {
      const name = stake.friendName;
      switch (stake.status) {
        case 'armed':
          return { kind: 'phrase', phrase: `${name} hears about it` };
        case 'told':
          return { kind: 'phrase', phrase: `${name} was told` };
        case 'released':
          return { kind: 'phrase', phrase: `${name} never heard` };
        case 'void':
          return null;
      }
      break;
    }
    case 'lockout':
      return stake.status === 'triggered'
        ? { kind: 'phrase', phrase: `Habits froze for ${freezeLength(stake.days)}` }
        : null;
  }
  return null;
}
