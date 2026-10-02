import { ConvexError, type Infer } from 'convex/values';

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import {
  countsTowardCap,
  MONEY_BLOCKED_ERROR,
  MONEY_CAP_CENTS,
  MONEY_CAP_ERROR,
  stakeView,
  type StakeView,
} from './stakeRules';
import { armComeback } from './comebacks';
import type { runValidator } from './stakeSchema';

/**
 * Database helpers for stakes: the cap on money at risk, and moving goal money
 * out of the old embedded `goals.stake` into its own row.
 */

export type Run = Infer<typeof runValidator>;

/** Bounds on what one user can have; far above anything real. */
const MAX_OPEN_STAKES = 200;
const MAX_GOALS = 500;

/**
 * Money armed or being charged right now, across goals and habits. Goal money
 * that hasn't moved to its own row yet counts too, until the migration is done.
 */
export async function usedMoneyCents(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<number> {
  let total = 0;
  for (const status of ['armed', 'charging'] as const) {
    const rows = await ctx.db
      .query('stakes')
      .withIndex('by_user_and_status', (q) => q.eq('userId', userId).eq('status', status))
      .take(MAX_OPEN_STAKES);
    for (const stake of rows) {
      if (countsTowardCap(stake) && stake.kind === 'money') total += stake.amountCents;
    }
  }

  const goals = await ctx.db
    .query('goals')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .order('desc')
    .take(MAX_GOALS);
  for (const goal of goals) {
    if (goal.stakeId !== undefined || goal.stake === undefined) continue;
    if (goal.stake.status === 'armed' || goal.stake.status === 'charging') {
      total += goal.stake.amountCents;
    }
  }

  return total;
}

/**
 * Refuses a new money stake that would go over the cap, or from a user whose
 * money stakes are off (a chargeback or fraud warning, `blockMoney`). An
 * unsettled decline doesn't block it: it's still owed, but paying up is left
 * to the user.
 */
export async function requireMoneyHeadroom(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  amountCents: number,
): Promise<void> {
  const user = await ctx.db.get('users', userId);
  if (user?.moneyBlocked !== undefined) throw new ConvexError(MONEY_BLOCKED_ERROR);
  if ((await usedMoneyCents(ctx, userId)) + amountCents > MONEY_CAP_CENTS) {
    throw new ConvexError(MONEY_CAP_ERROR);
  }
}

/**
 * Turns money stakes off for a user after a chargeback or a fraud warning:
 * charging their card again would only invite another. Stakes already armed
 * stay as they are. Cleared by hand, from the dashboard, once it's sorted out.
 */
export async function blockMoney(
  ctx: MutationCtx,
  userId: Id<'users'>,
  reason: 'dispute' | 'fraud_warning',
): Promise<void> {
  const user = await ctx.db.get('users', userId);
  if (user === null || user.moneyBlocked !== undefined) return;
  await ctx.db.patch('users', userId, { moneyBlocked: { at: Date.now(), reason } });
}

/** Cancels a scheduled job. `cancel` throws once the job ran, which is the case where there's nothing to cancel. */
export async function cancelJob(
  ctx: MutationCtx,
  jobId: Id<'_scheduled_functions'> | undefined,
): Promise<void> {
  if (jobId === undefined) return;
  try {
    await ctx.scheduler.cancel(jobId);
  } catch {
    // Already ran or was cleaned up; the stake status is the source of truth.
  }
}

/**
 * The goal's stake as a row, moving it there first if it still lives on the
 * goal (`goals.stake`, before stakes had their own table). Idempotent: every
 * mutation that touches a goal's stake calls this before reading it.
 */
export async function materializeGoalStake(
  ctx: MutationCtx,
  goal: Doc<'goals'>,
): Promise<Doc<'stakes'> | null> {
  if (goal.stakeId !== undefined) {
    return await ctx.db.get('stakes', goal.stakeId);
  }
  const legacy = goal.stake;
  if (legacy === undefined) return null;

  const came = legacy.status !== 'armed' && legacy.status !== 'released';
  const lostAt = came ? (legacy.chargedAt ?? goal.dueAt) : undefined;
  const stakeId = await ctx.db.insert('stakes', {
    kind: 'money',
    userId: goal.userId,
    goalId: goal._id,
    title: goal.title,
    createdAt: goal._creationTime,
    // A loss from before the loss screen existed is not sprung on anyone now.
    lostAt,
    seenAt: lostAt,
    releasedAt: legacy.status === 'released' ? (goal.completedAt ?? goal.dueAt) : undefined,
    resolveJobId: legacy.settleJobId,
    status: legacy.status,
    amountCents: legacy.amountCents,
    stripeCustomerId: legacy.stripeCustomerId,
    stripePaymentMethodId: legacy.stripePaymentMethodId,
    stripeSetupIntentId: legacy.stripeSetupIntentId,
    stripePaymentIntentId: legacy.stripePaymentIntentId,
    chargedAt: legacy.chargedAt,
    failureReason: legacy.failureReason,
    // Before `failureKind`, Stripe outages were recorded as this exact reason.
    failureKind:
      legacy.status === 'charge_failed'
        ? legacy.failureReason === 'Could not reach Stripe'
          ? 'error'
          : 'declined'
        : undefined,
    refundedCents: legacy.refundedCents,
    refundedAt: legacy.refundedAt,
    stripeDisputeId: legacy.stripeDisputeId,
    disputedAt: legacy.disputedAt,
  });
  await ctx.db.patch('goals', goal._id, { stakeId, stake: undefined });

  return await ctx.db.get('stakes', stakeId);
}

/** The view of a stake by id, for queries. */
export async function readStakeView(
  ctx: QueryCtx | MutationCtx,
  stakeId: Id<'stakes'> | undefined,
): Promise<StakeView | null> {
  if (stakeId === undefined) return null;
  const stake = await ctx.db.get('stakes', stakeId);
  return stake === null ? null : stakeView(stake);
}

/**
 * Lets an armed stake go: the goal was proven, or the habit ended first.
 * Anything already due is left alone.
 */
export async function releaseStake(ctx: MutationCtx, stake: Doc<'stakes'>): Promise<void> {
  if (stake.status !== 'armed') return;
  await cancelJob(ctx, stake.resolveJobId);
  await ctx.db.patch('stakes', stake._id, {
    status: 'released',
    releasedAt: Date.now(),
    resolveJobId: undefined,
  });
}

/**
 * Makes the stake come due: money is claimed for charging, a friend is
 * emailed, and a lockout is marked triggered (the caller freezes the habits,
 * since several can trigger in one check). Returns false when it was not
 * armed, so a second run can never apply it twice.
 */
export async function loseStake(
  ctx: MutationCtx,
  stake: Doc<'stakes'>,
  now: number,
  run?: Run,
): Promise<boolean> {
  if (stake.status !== 'armed') return false;
  const due = { lostAt: now, run, resolveJobId: undefined };
  await armComeback(ctx, stake.userId, { endedAt: now, outcome: 'missed', title: stake.title });

  switch (stake.kind) {
    case 'money':
      await ctx.db.patch('stakes', stake._id, { ...due, status: 'charging' });
      await ctx.scheduler.runAfter(0, internal.stripe.chargeStake, {
        stakeId: stake._id,
        attempt: 0,
      });
      return true;
    case 'friend':
      await ctx.db.patch('stakes', stake._id, { ...due, status: 'told', toldAt: now });
      await ctx.scheduler.runAfter(0, internal.emails.sendLoss, { stakeId: stake._id });
      return true;
    case 'lockout':
      await ctx.db.patch('stakes', stake._id, { ...due, status: 'triggered' });
      return true;
  }
}
