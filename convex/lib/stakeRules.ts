// Only type imports from `_generated`, so the app bundle can import this file too.
import { v, type Infer } from 'convex/values';

import type { Doc } from '../_generated/dataModel';
import {
  friendStatusValidator,
  lockoutDaysValidator,
  lockoutStatusValidator,
  moneyStatusValidator,
} from './stakeSchema';

/**
 * The rules every stake is held to, shared by the server and the app: amounts,
 * the cap on money at risk, lockout lengths, and the view of a stake the app
 * is allowed to see (no Stripe ids).
 */

export type StakeKind = 'money' | 'friend' | 'lockout' | 'none';

export const MIN_STAKE_CENTS = 100;
export const MAX_STAKE_CENTS = 5000;
export const DEFAULT_STAKE_CENTS = 1000;

/** The most money one user can have armed at once, across every goal and habit. */
export const MONEY_CAP_CENTS = 15000;

export type LockoutDays = Infer<typeof lockoutDaysValidator>;
export const LOCKOUT_DAYS: readonly LockoutDays[] = [1, 3, 7];
export const DEFAULT_LOCKOUT_DAYS: LockoutDays = 3;

export function isLockoutDays(days: number): days is LockoutDays {
  return (LOCKOUT_DAYS as readonly number[]).includes(days);
}

export function isValidStakeAmount(amountCents: number): boolean {
  return (
    Number.isInteger(amountCents) &&
    amountCents >= MIN_STAKE_CENTS &&
    amountCents <= MAX_STAKE_CENTS
  );
}

export const STAKE_AMOUNT_ERROR = `A stake has to be between $${MIN_STAKE_CENTS / 100} and $${MAX_STAKE_CENTS / 100}`;

export const MONEY_CAP_ERROR = `That would put more than $${MONEY_CAP_CENTS / 100} on the line at once`;

/** Every stake view carries these; `lostAt` is set once the commitment was missed. */
const viewCommon = {
  _id: v.id('stakes'),
  lostAt: v.optional(v.number()),
};

export const stakeViewValidator = v.union(
  v.object({
    kind: v.literal('money'),
    ...viewCommon,
    status: moneyStatusValidator,
    amountCents: v.number(),
    cardBrand: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    failureKind: v.optional(v.union(v.literal('declined'), v.literal('error'))),
  }),
  v.object({
    kind: v.literal('friend'),
    ...viewCommon,
    status: friendStatusValidator,
    friendId: v.id('friends'),
    friendName: v.string(),
  }),
  v.object({
    kind: v.literal('lockout'),
    ...viewCommon,
    status: lockoutStatusValidator,
    days: lockoutDaysValidator,
  }),
);

export type StakeView = Infer<typeof stakeViewValidator>;

/** What the app may see of a stake: never the Stripe customer or payment method. */
export function stakeView(stake: Doc<'stakes'>): StakeView {
  switch (stake.kind) {
    case 'money':
      return {
        kind: 'money',
        _id: stake._id,
        lostAt: stake.lostAt,
        status: stake.status,
        amountCents: stake.amountCents,
        cardBrand: stake.cardBrand,
        cardLast4: stake.cardLast4,
        failureKind: stake.failureKind,
      };
    case 'friend':
      return {
        kind: 'friend',
        _id: stake._id,
        lostAt: stake.lostAt,
        status: stake.status,
        friendId: stake.friendId,
        friendName: stake.friendName,
      };
    case 'lockout':
      return {
        kind: 'lockout',
        _id: stake._id,
        lostAt: stake.lostAt,
        status: stake.status,
        days: stake.days,
      };
  }
}

/** Still riding on the commitment: nothing has come due, and it hasn't been let go. */
export function isStakeArmed(stake: Pick<StakeView, 'status'>): boolean {
  return stake.status === 'armed';
}

/** Armed, or a charge already in flight: the stake can't be called off. */
export function isStakeLive(stake: Pick<StakeView, 'kind' | 'status'>): boolean {
  return stake.status === 'armed' || (stake.kind === 'money' && stake.status === 'charging');
}

/** Whether money counts against the cap: armed, or on its way out. */
export function countsTowardCap(stake: Pick<Doc<'stakes'>, 'kind' | 'status'>): boolean {
  return stake.kind === 'money' && (stake.status === 'armed' || stake.status === 'charging');
}

/**
 * Stripe's idempotency key for charging a stake. Goals keep the key they had
 * before stakes got their own table, so a charge that straddles the move
 * cannot go through twice; a goal only ever has one money stake.
 */
export function chargeIdempotencyKey(stake: Pick<Doc<'stakes'>, '_id' | 'goalId'>): string {
  return stake.goalId !== undefined ? `goal-settle-${stake.goalId}` : `stake-charge-${stake._id}`;
}
