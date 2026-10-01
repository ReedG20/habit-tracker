import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';

/**
 * Proof outlives a commitment that cost money. Deleting a habit or goal
 * normally takes its proof photos with it, but when a money stake on it came
 * due, the proof is what support needs to judge a contested charge
 * (`chargeReviews.ts`) and what Stripe needs to answer a chargeback. So the
 * rows and photos stay, out of sight (nothing reads proof for a commitment
 * that's gone), until the card networks' dispute window has closed.
 */

/** Cardholders can dispute for up to 120 days; a little slack on top. */
export const EVIDENCE_RETENTION_MS = 130 * 24 * 60 * 60 * 1000;
const PURGE_BATCH = 100;

type Commitment = { habitId: Id<'habits'> } | { goalId: Id<'goals'> };

/**
 * Whether the commitment's proof must be kept, scheduling its purge for when
 * the window closes. True when a money stake on it came due within the window
 * (charging, charged, declined, refunded or disputed alike).
 */
export async function holdEvidence(ctx: MutationCtx, commitment: Commitment): Promise<boolean> {
  const since = Date.now() - EVIDENCE_RETENTION_MS;
  const stakes =
    'habitId' in commitment
      ? await ctx.db
          .query('stakes')
          .withIndex('by_habit', (q) => q.eq('habitId', commitment.habitId))
          .take(100)
      : await ctx.db
          .query('stakes')
          .withIndex('by_goal', (q) => q.eq('goalId', commitment.goalId))
          .take(100);
  const lost = stakes.some(
    (stake) => stake.kind === 'money' && stake.lostAt !== undefined && stake.lostAt > since,
  );
  if (!lost) return false;

  await ctx.scheduler.runAfter(EVIDENCE_RETENTION_MS, internal.evidence.purge, commitment);
  return true;
}

/** Deletes the held proof of a commitment that's gone, photos included. */
export const purge = internalMutation({
  args: { habitId: v.optional(v.id('habits')), goalId: v.optional(v.id('goals')) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { habitId, goalId } = args;
    let more = false;
    if (habitId !== undefined) {
      const rows = await ctx.db
        .query('habitVerifications')
        .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId))
        .take(PURGE_BATCH);
      for (const row of rows) {
        if (row.photoId !== undefined) await ctx.storage.delete(row.photoId);
        await ctx.db.delete('habitVerifications', row._id);
      }
      more = rows.length === PURGE_BATCH;
    } else if (goalId !== undefined) {
      const rows = await ctx.db
        .query('goalSubmissions')
        .withIndex('by_goal', (q) => q.eq('goalId', goalId))
        .take(PURGE_BATCH);
      for (const row of rows) {
        for (const photoId of row.photoIds) await ctx.storage.delete(photoId);
        await ctx.db.delete('goalSubmissions', row._id);
      }
      more = rows.length === PURGE_BATCH;
    }

    if (more) await ctx.scheduler.runAfter(0, internal.evidence.purge, args);
    return null;
  },
});
