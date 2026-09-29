import type { HabitWithProgress } from '@/data/habits';
import type { StakeView } from '@/convex/lib/stakeRules';
import { formatCents } from '@/lib/money';

/**
 * What skipping a habit costs, in words, from the stake each one carries.
 * Shared by Today, the habit card and detail, so they never disagree.
 */

export type HabitCost =
  | { kind: 'money'; cents: number }
  | { kind: 'friend'; name: string }
  | { kind: 'lockout'; days: number }
  | { kind: 'none' };

/** Only an armed stake costs anything; a void or spent one is back to their word. */
export function stakeCost(stake: StakeView | null): HabitCost {
  if (stake === null || stake.status !== 'armed') return { kind: 'none' };
  switch (stake.kind) {
    case 'money':
      return { kind: 'money', cents: stake.amountCents };
    case 'friend':
      return { kind: 'friend', name: stake.friendName };
    case 'lockout':
      return { kind: 'lockout', days: stake.days };
  }
}

export function habitCost(habit: Pick<HabitWithProgress, 'stakeView'>): HabitCost {
  return stakeCost(habit.stakeView);
}

/** "1 day", "3 days", "a week". */
export function freezeLength(days: number): string {
  if (days >= 7) return 'a week';
  return days === 1 ? '1 day' : `${days} days`;
}

export type SkipConsequence = {
  /** The most money one skip would cost, in cents; 0 when none is on them. */
  cents: number;
  /** As the end of "Skip it and ___": "$25 is charged", "Sam hears about it". */
  phrase: string;
  /** For a kicker: "$25 charged", "Sam hears". */
  short: string;
  kind: HabitCost['kind'];
};

/**
 * What skipping one of these would cost: the most money on any of them;
 * without money, the harshest of the rest.
 */
export function skipConsequence(habits: Pick<HabitWithProgress, 'stakeView'>[]): SkipConsequence {
  const costs = habits.map(habitCost);
  const cents = costs.reduce(
    (most, cost) => Math.max(most, cost.kind === 'money' ? cost.cents : 0),
    0,
  );
  if (cents > 0) {
    return {
      cents,
      phrase: `${formatCents(cents)} is charged`,
      short: `${formatCents(cents)} charged`,
      kind: 'money',
    };
  }
  const lockout = costs.find((cost) => cost.kind === 'lockout');
  if (lockout?.kind === 'lockout') {
    return {
      cents: 0,
      phrase: `your habits freeze for ${freezeLength(lockout.days)}`,
      short: 'Habits freeze',
      kind: 'lockout',
    };
  }
  const friend = costs.find((cost) => cost.kind === 'friend');
  if (friend?.kind === 'friend') {
    return {
      cents: 0,
      phrase: `${friend.name} hears about it`,
      short: `${friend.name} hears`,
      kind: 'friend',
    };
  }
  return { cents: 0, phrase: 'the streak starts over', short: 'Streak resets', kind: 'none' };
}

/** A short chip for a card: "$25", "Sam", "3-day lock". `null` when it's just their word. */
export function stakeChip(stake: StakeView | null): string | null {
  const cost = stakeCost(stake);
  switch (cost.kind) {
    case 'money':
      return formatCents(cost.cents);
    case 'friend':
      return cost.name;
    case 'lockout':
      return cost.days >= 7 ? '1-week lock' : `${cost.days}-day lock`;
    case 'none':
      return null;
  }
}

/** The one-line state of a goal's stake: `pill` for the card, `detail` for the goal screen. */
export function describeGoalStake(
  stake: StakeView | null,
  variant: 'pill' | 'detail',
): string | null {
  if (stake === null) return variant === 'pill' ? null : 'Just your word';

  if (stake.kind === 'friend') {
    const name = stake.friendName;
    switch (stake.status) {
      case 'armed':
        return variant === 'pill' ? `${name}’s watching` : `${name} hears about it if you miss`;
      case 'told':
        return variant === 'pill' ? `${name} told` : `${name} was told`;
      case 'released':
        return variant === 'pill' ? `${name} · safe` : `Kept. ${name} never heard a thing`;
      case 'void':
        return variant === 'pill' ? null : `${name} opted out, so it’s on your word`;
    }
  }
  if (stake.kind === 'lockout') return null;

  const amount = formatCents(stake.amountCents);
  switch (stake.status) {
    case 'armed':
      return variant === 'pill' ? `${amount} on it` : `${amount} · charged if missed`;
    case 'charging':
      return `${amount} · charging`;
    case 'charged':
      return variant === 'pill' ? `Charged ${amount}` : `${amount} · charged`;
    case 'charge_failed':
      return stake.failureKind === 'declined'
        ? `${amount} · card declined`
        : `${amount} · charge failed`;
    case 'released':
      return `${amount} · safe`;
    case 'refunded':
      return `${amount} · refunded`;
    case 'disputed':
      return `${amount} · disputed`;
  }
}
