// No imports from `_generated`, so the app bundle can import this file too.
import {
  DEFAULT_STAKE_CENTS,
  LOCKOUT_DAYS,
  MAX_STAKE_CENTS,
  MIN_STAKE_CENTS,
  type LockoutDays,
  type StakeKind,
} from './stakeRules';

/**
 * The ladder a commitment's stake can only climb: just their word, then a
 * lockout, then a friend, then money. Raising means a higher rung, or more of
 * the same one (more money, a longer lockout). Goals skip the lockout rung.
 * Shared by the server, which enforces it, and the app, which offers it.
 */

/** What the ladder needs to know of a stake; `StakeView` fits. */
export type LadderStake =
  | { kind: 'money'; status: string; amountCents: number }
  | { kind: 'friend'; status: string }
  | { kind: 'lockout'; status: string; days: LockoutDays };

export type LadderChoice =
  | { kind: 'money'; amountCents: number }
  | { kind: 'friend' }
  | { kind: 'lockout'; days: LockoutDays };

/**
 * Money that replaces a friend starts here. Less would let someone about to
 * miss pay a dollar so their friend never hears about it.
 */
export const FRIEND_TO_MONEY_MIN_CENTS = DEFAULT_STAKE_CENTS;

const RUNGS: Record<StakeKind, number> = { none: 0, lockout: 1, friend: 2, money: 3 };

/** The stake that's actually holding the commitment: a friend who opted out holds nothing. */
export function heldStake<T extends LadderStake>(stake: T | null): T | null {
  if (stake === null) return null;
  return stake.kind === 'friend' && stake.status === 'void' ? null : stake;
}

export function stakeRung(stake: LadderStake | null): number {
  const held = heldStake(stake);
  return RUNGS[held === null ? 'none' : held.kind];
}

export type RaiseOptions = {
  /** The kinds that would raise it, in ladder order. The current kind is here only if it can go higher. */
  kinds: Exclude<StakeKind, 'none'>[];
  /** What the stake is now: 'none' for no stake, or a friend who opted out. */
  currentKind: StakeKind;
  /** The least money that would be a raise. */
  moneyMinCents: number;
  /** The shortest lockout that would be a raise; null when a lockout isn't offered. */
  lockoutMinDays: LockoutDays | null;
  canRaise: boolean;
};

/** Everything above where the stake sits now. Money is further bounded by the cap, which the caller knows. */
export function raiseOptions(
  current: LadderStake | null,
  commitment: 'habit' | 'goal',
): RaiseOptions {
  const held = heldStake(current);
  const rung = stakeRung(held);
  const kinds: RaiseOptions['kinds'] = [];

  let lockoutMinDays: LockoutDays | null = null;
  if (commitment === 'habit' && rung <= RUNGS.lockout) {
    const floor = held?.kind === 'lockout' ? held.days : 0;
    lockoutMinDays = LOCKOUT_DAYS.find((days) => days > floor) ?? null;
    if (lockoutMinDays !== null) kinds.push('lockout');
  }

  if (rung < RUNGS.friend) kinds.push('friend');

  const moneyMinCents =
    held?.kind === 'money'
      ? held.amountCents + 100
      : held?.kind === 'friend'
        ? FRIEND_TO_MONEY_MIN_CENTS
        : MIN_STAKE_CENTS;
  if (moneyMinCents <= MAX_STAKE_CENTS) kinds.push('money');

  return {
    kinds,
    currentKind: held === null ? 'none' : held.kind,
    moneyMinCents,
    lockoutMinDays,
    canRaise: kinds.length > 0,
  };
}

/** Why `next` wouldn't raise the stakes, or null when it would. */
export function raiseProblem(
  current: LadderStake | null,
  next: LadderChoice,
  commitment: 'habit' | 'goal',
): string | null {
  const options = raiseOptions(current, commitment);
  if (!options.kinds.includes(next.kind)) return 'That wouldn’t raise the stakes';

  switch (next.kind) {
    case 'money':
      if (next.amountCents > MAX_STAKE_CENTS) {
        return `A stake can be at most $${MAX_STAKE_CENTS / 100}`;
      }
      if (next.amountCents < options.moneyMinCents) {
        return options.currentKind === 'friend'
          ? `Replacing a friend takes at least $${options.moneyMinCents / 100}`
          : `Raise it to at least $${options.moneyMinCents / 100}`;
      }
      return null;
    case 'lockout':
      return options.lockoutMinDays !== null && next.days >= options.lockoutMinDays
        ? null
        : 'Pick a longer lockout';
    case 'friend':
      return null;
  }
}
