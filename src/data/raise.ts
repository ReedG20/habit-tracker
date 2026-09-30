import type { FunctionReturnType } from 'convex/server';

import {
  defaultDueAt,
  EMPTY_FRIEND,
  FRESH_PROOF,
  lockoutLabel,
  type CommitmentDraft,
} from '@/components/commitment/draft';
import type { api } from '@/convex/_generated/api';
import { DAILY } from '@/convex/lib/frequency';
import { heldStake, type RaiseOptions } from '@/convex/lib/stakeLadder';
import {
  DEFAULT_LOCKOUT_DAYS,
  DEFAULT_STAKE_CENTS,
  MAX_STAKE_CENTS,
  type StakeKind,
  type StakeView,
} from '@/convex/lib/stakeRules';
import { formatCents } from '@/lib/money';

/**
 * Upping the ante on a running commitment: the draft the raise screen starts
 * from, and how the stake it's raising from reads. Pure, so it's tested.
 */

export type RaiseTarget = NonNullable<FunctionReturnType<typeof api.raises.target>>;

/** The amounts the picker offers as chips; a raise on money starts at the next one up. */
const STEP_UPS_CENTS = [500, 1000, 2500, 5000];

/** Where the amount starts: a real step up on money already there, else the usual $10. */
export function startingAmount(options: RaiseOptions): number {
  const min = options.moneyMinCents;
  if (options.currentKind === 'money') {
    return STEP_UPS_CENTS.find((cents) => cents >= min) ?? Math.min(min, MAX_STAKE_CENTS);
  }
  return Math.max(DEFAULT_STAKE_CENTS, min);
}

/** The highest rung on offer: money when it's there, as the pick for new commitments is. */
export function startingKind(options: RaiseOptions): StakeKind {
  for (const kind of ['money', 'friend', 'lockout'] as const) {
    if (options.kinds.includes(kind)) return kind;
  }
  return options.currentKind;
}

/** The commitment as a draft, so the stakes, contract and summary pieces read it like a new one. */
export function raiseDraft(target: RaiseTarget, options: RaiseOptions): CommitmentDraft {
  // The usual 3 days, unless the lockout already there makes that no raise.
  const min = options.lockoutMinDays;
  const lockoutDays = min !== null && min > DEFAULT_LOCKOUT_DAYS ? min : DEFAULT_LOCKOUT_DAYS;
  return {
    kind: target.commitment,
    title: target.title,
    proof: target.description ?? '',
    timesPerWeek: target.timesPerWeek ?? DAILY,
    proofMethod: target.proofMethod ?? FRESH_PROOF.proofMethod,
    timerMinutes: target.timerMinutes ?? FRESH_PROOF.timerMinutes,
    dueAt: target.dueAt ?? defaultDueAt(),
    stakeKind: startingKind(options),
    amountCents: startingAmount(options),
    card: null,
    friend: EMPTY_FRIEND,
    lockoutDays,
  };
}

/** What a miss does now, to finish "Right now, missing it ___". */
export function missNow(stake: StakeView | null): string {
  const held = heldStake(stake);
  if (held === null) {
    return stake?.kind === 'friend'
      ? `costs you nothing: ${stake.friendName} opted out`
      : 'costs you nothing';
  }
  switch (held.kind) {
    case 'money':
      return `costs you ${formatCents(held.amountCents)}`;
    case 'friend':
      return `means ${held.friendName} hears about it`;
    case 'lockout':
      return `freezes your habits for ${lockoutLabel(held.days)}`;
  }
}

/** What becomes of the old stake when a different kind replaces it; null when nothing does. */
export function replacedLine(stake: StakeView | null, nextKind: StakeKind): string | null {
  const held = heldStake(stake);
  if (held === null || held.kind === nextKind) return null;
  switch (held.kind) {
    case 'friend':
      return `${held.friendName} is off the hook: we won’t email them about this one.`;
    case 'lockout':
      return `The ${held.days === 7 ? 'week-long' : `${held.days}-day`} lockout comes off.`;
    case 'money':
      return null;
  }
}

/** The line under "Up the ante" on a detail screen: what's above where it sits. */
export function raiseHint(stake: StakeView | null, options: RaiseOptions): string {
  const held = heldStake(stake);
  if (held?.kind === 'money') return `Put more than ${formatCents(held.amountCents)} on it.`;
  if (held?.kind === 'friend') {
    return `Swap ${held.friendName} for money: ${formatCents(options.moneyMinCents)} or more.`;
  }
  const lockout = options.kinds.includes('lockout')
    ? held?.kind === 'lockout'
      ? 'a longer lockout'
      : 'a lockout'
    : null;
  const friend = stake?.kind === 'friend' ? 'a new friend' : 'a friend';
  const moves = [lockout, friend, 'money'].filter((move) => move !== null);
  const list =
    moves.length === 2 ? `${moves[0]} or ${moves[1]}` : `${moves[0]}, ${moves[1]} or ${moves[2]}`;
  const opener = stake?.kind === 'friend' ? `${stake.friendName} opted out. Try ` : 'Back it with ';
  return `${opener}${list}.`;
}

/** A stake's size for analytics: cents for money, 0 for the rest. */
export function stakeCents(kind: StakeKind, amountCents: number | undefined): number {
  return kind === 'money' ? (amountCents ?? 0) : 0;
}
