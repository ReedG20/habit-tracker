import {
  DEFAULT_STAKE_CENTS,
  defaultDueAt,
  dueInDays,
  FRESH_PROOF,
  wordingSignature,
  type CommitmentDraft,
  type CommitmentKind,
} from './draft';

import type { GoAgain } from '@/convex/accomplishments';
import type { Revisable } from '@/convex/callOff';
import { daysBefore } from '@/convex/lib/days';
import { DAILY } from '@/convex/lib/frequency';
import { raiseOptions, type LadderStake } from '@/convex/lib/stakeLadder';
import { MAX_STAKE_CENTS } from '@/convex/lib/stakeRules';
import { todayKey } from '@/lib/dates';
import { cardLabel } from '@/lib/money';

/**
 * A commitment still in its window (`callOff.revisable`), as the New flow's
 * draft: everything it was signed with, so changing one term doesn't mean
 * typing the rest again. Its wording already passed the check, and a money
 * stake keeps the card it was on.
 */
export function draftFromRevisable(revisable: Revisable): Partial<CommitmentDraft> {
  const words = {
    kind: revisable.kind,
    title: revisable.title,
    proof: revisable.description ?? '',
    proofMethod: revisable.proofMethod ?? FRESH_PROOF.proofMethod,
  };
  const { stake } = revisable;

  return {
    ...words,
    timesPerWeek: revisable.timesPerWeek ?? DAILY,
    endsOn: revisable.endsOn,
    timerMinutes: revisable.timerMinutes ?? FRESH_PROOF.timerMinutes,
    checkedWording: wordingSignature(words),
    icon: revisable.icon,
    iconChosen: revisable.iconChosen,
    ...(revisable.dueAt === undefined ? {} : { dueAt: revisable.dueAt }),
    stakeKind: stake?.kind ?? 'none',
    ...(stake?.kind === 'money'
      ? {
          amountCents: stake.amountCents,
          reuse:
            stake.cardLast4 === undefined
              ? undefined
              : { fromStakeId: stake.stakeId, label: cardLabel(stake), on: true },
        }
      : {}),
    ...(stake?.kind === 'friend'
      ? { friend: { friendId: stake.friendId, name: stake.name, email: stake.email } }
      : {}),
    ...(stake?.kind === 'lockout' ? { lockoutDays: stake.days } : {}),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A kept commitment's terms (`accomplishments.again`) as a fresh draft for
 * "Go again": the same words, how it's proven and how often, the same stake
 * on the same card, and a new end date or deadline of the same length.
 */
export function draftFromKept(
  again: GoAgain,
  now: number = Date.now(),
  today: string = todayKey(),
): Partial<CommitmentDraft> {
  const words = {
    kind: again.kind,
    title: again.title,
    proof: again.description ?? '',
    proofMethod: again.proofMethod ?? FRESH_PROOF.proofMethod,
  };
  const { stake } = again;
  const lengthDays =
    again.lengthMs === undefined ? undefined : Math.max(1, Math.round(again.lengthMs / DAY_MS));

  return {
    ...words,
    timesPerWeek: again.timesPerWeek ?? DAILY,
    timerMinutes: again.timerMinutes ?? FRESH_PROOF.timerMinutes,
    // It passed the check the first time; only a complete set of terms skips it.
    ...(again.complete ? { checkedWording: wordingSignature(words) } : {}),
    icon: again.icon,
    iconChosen: again.iconChosen,
    ...(again.lengthDays === undefined
      ? {}
      : { endsOn: daysBefore(today, -(again.lengthDays - 1)) }),
    ...(lengthDays === undefined ? {} : { dueAt: dueInDays(lengthDays, defaultDueAt(now), now) }),
    stakeKind: stake?.kind ?? 'none',
    ...(stake?.kind === 'money'
      ? {
          amountCents: stake.amountCents,
          reuse:
            stake.cardLast4 === undefined
              ? undefined
              : { fromStakeId: stake.stakeId, label: cardLabel(stake), on: true },
        }
      : {}),
    ...(stake?.kind === 'friend'
      ? { friend: { friendId: stake.friendId, name: stake.name, email: stake.email } }
      : {}),
    ...(stake?.kind === 'lockout' ? { lockoutDays: stake.days } : {}),
  };
}

/** What the ladder makes of a stake that held to the end. */
function ladderStake(stake: GoAgain['stake']): LadderStake | null {
  if (stake === null) return null;
  switch (stake.kind) {
    case 'money':
      return { kind: 'money', status: 'released', amountCents: stake.amountCents };
    case 'friend':
      return { kind: 'friend', status: 'released' };
    case 'lockout':
      return { kind: 'lockout', status: 'released', days: stake.days };
  }
}

/** Money raised by about half, in whole $5s, within the bounds. */
function moreMoney(cents: number, minCents: number): number {
  return Math.min(MAX_STAKE_CENTS, Math.max(minCents, Math.ceil((cents * 1.5) / 500) * 500));
}

/**
 * "Go again, higher": the next rung up the ladder (`convex/lib/stakeLadder.ts`)
 * from what it was kept on, or more of the same once it's already money.
 * `null` when there's nowhere higher to go.
 */
export function higherStakePatch(
  stake: GoAgain['stake'],
  kind: CommitmentKind,
): Partial<CommitmentDraft> | null {
  const current = ladderStake(stake);
  const options = raiseOptions(current, kind);
  if (!options.canRaise) return null;
  const next = options.kinds.find((rung) => rung !== options.currentKind) ?? options.currentKind;

  switch (next) {
    case 'money':
      return {
        stakeKind: 'money',
        amountCents:
          current?.kind === 'money'
            ? moreMoney(current.amountCents, options.moneyMinCents)
            : Math.max(options.moneyMinCents, DEFAULT_STAKE_CENTS),
      };
    case 'friend':
      return { stakeKind: 'friend' };
    case 'lockout':
      return {
        stakeKind: 'lockout',
        ...(options.lockoutMinDays === null ? {} : { lockoutDays: options.lockoutMinDays }),
      };
    case 'none':
      return null;
  }
}
