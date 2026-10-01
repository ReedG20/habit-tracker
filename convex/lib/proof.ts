import { ConvexError } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { requireHabitsUnfrozen } from '../freezes';
import { requireOwnedHabit, type AuthedCtx } from '../habits';
import { requirePro } from './entitlements';
import { localDay, requireUnlocked } from './lockout';
import { notifyHabitVerdict } from './notify';
import { proofMethodOf, type ProofMethod } from './proofMethods';

/**
 * What every proof method shares: the checks before an attempt may start, and
 * how a verdict is recorded. Photo (`verifications.ts`), location
 * (`locationProofs.ts`) and timer (`timerProofs.ts`) all end in the same
 * `habitVerifications` row, so streaks, the nightly check, setbacks and
 * excused days treat them alike.
 */

/**
 * Whether the habit can be proved right now, and for which day. The day is
 * worked out from the user's stored time zone, so proof can never be filed
 * under a day the nightly check has already judged; the client's `day` is only
 * used for users whose zone is not known yet.
 */
export async function requireCanProve(
  ctx: AuthedCtx<MutationCtx>,
  habitId: Id<'habits'>,
  clientDay: string,
  method: ProofMethod,
): Promise<{ habit: Doc<'habits'>; day: string }> {
  const habit = await requireOwnedHabit(ctx, habitId);
  await requireUnlocked(ctx, ctx.user._id);
  await requireHabitsUnfrozen(ctx, ctx.user._id);
  if (habit.brokenAt !== undefined) {
    throw new ConvexError('This streak broke. Restart the habit to log it again.');
  }
  // A paused habit (Pro ended) is not checked, so it takes no proof either.
  await requirePro(ctx, ctx.user._id);
  if (proofMethodOf(habit) !== method) {
    throw new ConvexError('This habit is proved another way. Update the app and try again.');
  }
  const day = ctx.user.timeZone === undefined ? clientDay : localDay(Date.now(), ctx.user.timeZone);

  const completion = await ctx.db
    .query('habitCompletions')
    .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId).eq('day', day))
    .unique();
  if (completion !== null) {
    throw new ConvexError('This habit is already logged for today');
  }

  const latest = await ctx.db
    .query('habitVerifications')
    .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId).eq('day', day))
    .order('desc')
    .first();
  if (latest?.status === 'pending') {
    throw new ConvexError('A check for this habit is already running');
  }

  return { habit, day };
}

export type Verdict = 'approved' | 'rejected' | 'failed';

/**
 * Resolves a pending row. Idempotent on purpose: an analysis may report back
 * after `expire` already flipped the row, or after the habit (and the row) was
 * deleted.
 */
export async function settleVerification(
  ctx: MutationCtx,
  verificationId: Id<'habitVerifications'>,
  verdict: { status: Verdict; reason: string; placeId?: string },
): Promise<void> {
  const verification = await ctx.db.get('habitVerifications', verificationId);
  if (verification === null || verification.status !== 'pending') {
    return;
  }

  await ctx.db.patch('habitVerifications', verificationId, {
    status: verdict.status,
    reason: verdict.reason,
    resolvedAt: Date.now(),
    ...(verdict.placeId === undefined ? {} : { placeId: verdict.placeId }),
  });

  if (verdict.status === 'approved') {
    await logCompletion(ctx, verification);
  }
  await notifyHabitVerdict(ctx, verification, verdict.status, verdict.reason);
}

/**
 * Uses the day stored on the verification, not "now", so a verdict that lands
 * after the day ends still counts for the day the proof was taken.
 */
export async function logCompletion(
  ctx: MutationCtx,
  verification: Pick<Doc<'habitVerifications'>, 'userId' | 'habitId' | 'day'>,
): Promise<void> {
  const habit = await ctx.db.get('habits', verification.habitId);
  if (habit === null) {
    return;
  }

  const existing = await ctx.db
    .query('habitCompletions')
    .withIndex('by_habit_and_day', (q) =>
      q.eq('habitId', verification.habitId).eq('day', verification.day),
    )
    .unique();
  if (existing !== null) {
    return;
  }

  await ctx.db.insert('habitCompletions', {
    userId: verification.userId,
    habitId: verification.habitId,
    day: verification.day,
    completedAt: Date.now(),
  });
}
