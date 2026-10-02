import { ConvexError, v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { internalMutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { cancelJob, materializeGoalStake, releaseStake, usedMoneyCents } from './lib/stakes';

/**
 * Deleting an account (`users.deleteAccount`): `prepare` lets go of whatever
 * is on the line, then `purgeBatch` runs until every row and photo the user
 * owns is gone, the `users` row last. Every step is idempotent, so a run cut
 * short is finished by trying again while the `users` row is still there.
 *
 * Left behind on purpose: `emailSuppressions` (the friend's choice, not the
 * user's data), `graceMarks` (one-way hashes, so the one-time reprieve can't
 * be earned again by signing up again; no user id) and the webhook dedupe
 * tables, which hold no user ids.
 */

export const CHARGING_ERROR = 'A charge is going through right now. Try again in a few minutes.';

/** Documents deleted per transaction, well under Convex's limits. */
export const PURGE_BATCH = 100;

/** Bounds on what one user can have open; far above the commitment limits. */
const MAX_OPEN_STAKES = 100;
const MAX_OWED = 50;

async function isCharging(ctx: QueryCtx | MutationCtx, userId: Id<'users'>): Promise<boolean> {
  const charging = await ctx.db
    .query('stakes')
    .withIndex('by_user_and_status', (q) => q.eq('userId', userId).eq('status', 'charging'))
    .first();
  return charging !== null;
}

export const previewValidator = v.object({
  /** A charge is in flight; deleting waits for it. */
  charging: v.boolean(),
  /** Declined stakes still owed; deleting doesn't cancel them. */
  owed: v.array(v.object({ stakeId: v.id('stakes'), title: v.string(), amountCents: v.number() })),
  /** Money on the line right now, which deleting lets go of. */
  armedMoneyCents: v.number(),
});

/** What the confirmation screen spells out. Null when signed out. */
export const preview = query({
  args: {},
  returns: v.union(previewValidator, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;

    const failed = await ctx.db
      .query('stakes')
      .withIndex('by_user_and_status', (q) =>
        q.eq('userId', user._id).eq('status', 'charge_failed'),
      )
      .take(MAX_OWED);
    const owed = failed.flatMap((stake) =>
      stake.kind === 'money' && stake.failureKind === 'declined'
        ? [{ stakeId: stake._id, title: stake.title, amountCents: stake.amountCents }]
        : [],
    );

    const charging = await isCharging(ctx, user._id);
    return {
      charging,
      owed,
      // With nothing charging, the money in use is exactly what's armed.
      armedMoneyCents: charging ? 0 : await usedMoneyCents(ctx, user._id),
    };
  },
});

/**
 * Lets go of everything on the line, in one transaction before anything
 * irreversible: armed stakes of every kind are released, so nothing can come
 * due mid-purge, and pending jobs are cancelled. Refused while a charge is in
 * flight, since its result would have nowhere to land. Returns the Stripe
 * customer to delete.
 */
export const prepare = internalMutation({
  args: { userId: v.id('users') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const user = await ctx.db.get('users', args.userId);
    if (user === null) return null;
    if (await isCharging(ctx, args.userId)) throw new ConvexError(CHARGING_ERROR);

    // Goal money still embedded on the goal moves to its own row, so the
    // release below and the purge see it like any other.
    for await (const goal of ctx.db
      .query('goals')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))) {
      if (goal.stakeId !== undefined || goal.stake === undefined) continue;
      if (goal.stake.status === 'charging') throw new ConvexError(CHARGING_ERROR);
      await materializeGoalStake(ctx, goal);
    }

    const armed = await ctx.db
      .query('stakes')
      .withIndex('by_user_and_status', (q) => q.eq('userId', args.userId).eq('status', 'armed'))
      .take(MAX_OPEN_STAKES);
    for (const stake of armed) {
      await releaseStake(ctx, stake);
    }

    const freezes = await ctx.db
      .query('freezes')
      .withIndex('by_user_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(MAX_OPEN_STAKES);
    for (const freeze of freezes) {
      await cancelJob(ctx, freeze.liftJobId);
    }

    const reminders = await ctx.db
      .query('reminderState')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    await cancelJob(ctx, reminders?.jobId);

    return user.stripeCustomerId ?? null;
  },
});

/**
 * Deletes up to `limit` of the user's documents from one table and returns
 * how many it deleted. Fewer than `limit` means the table is now clear of them.
 */
type PurgeStep = (ctx: MutationCtx, userId: Id<'users'>, limit: number) => Promise<number>;

/** A step for a table whose rows need nothing but deleting. */
function plain<T>(
  rows: (ctx: MutationCtx, userId: Id<'users'>, limit: number) => Promise<T[]>,
  remove: (ctx: MutationCtx, row: T) => Promise<void>,
): PurgeStep {
  return async (ctx, userId, limit) => {
    const page = await rows(ctx, userId, limit);
    for (const row of page) await remove(ctx, row);
    return page.length;
  };
}

/** In order: pushes stop first, the children of habits and goals go before them. */
const STEPS: PurgeStep[] = [
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('graces')
        .withIndex('by_user_and_seen', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('graces', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('pushTokens')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('pushTokens', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('reminderState')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('reminderState', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('notificationSettings')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('notificationSettings', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('habitCompletions')
        .withIndex('by_user_and_day', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('habitCompletions', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('habitVerifications')
        .withIndex('by_user_and_day', (q) => q.eq('userId', userId))
        .take(limit),
    async (ctx, row) => {
      if (row.photoId !== undefined) await ctx.storage.delete(row.photoId);
      await ctx.db.delete('habitVerifications', row._id);
    },
  ),
  // Timer runs have no user index, so they go habit by habit.
  async (ctx, userId, limit) => {
    let deleted = 0;
    const habits = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(limit);
    for (const habit of habits) {
      const runs = await ctx.db
        .query('habitTimerRuns')
        .withIndex('by_habit_and_day', (q) => q.eq('habitId', habit._id))
        .take(limit - deleted);
      for (const run of runs) await ctx.db.delete('habitTimerRuns', run._id);
      deleted += runs.length;
      if (deleted >= limit) return deleted;

      await ctx.db.delete('habits', habit._id);
      deleted += 1;
      if (deleted >= limit) return deleted;
    }
    return deleted;
  },
  // Submissions too, goal by goal, photos and all.
  async (ctx, userId, limit) => {
    let deleted = 0;
    const goals = await ctx.db
      .query('goals')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(limit);
    for (const goal of goals) {
      const submissions = await ctx.db
        .query('goalSubmissions')
        .withIndex('by_goal', (q) => q.eq('goalId', goal._id))
        .take(limit - deleted);
      for (const submission of submissions) {
        for (const photoId of submission.photoIds) await ctx.storage.delete(photoId);
        await ctx.db.delete('goalSubmissions', submission._id);
      }
      deleted += submissions.length;
      if (deleted >= limit) return deleted;

      await ctx.db.delete('goals', goal._id);
      deleted += 1;
      if (deleted >= limit) return deleted;
    }
    return deleted;
  },
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('stakes')
        .withIndex('by_user_and_status', (q) => q.eq('userId', userId))
        .take(limit),
    async (ctx, stake) => {
      // Came due since `prepare` (a check ran in between): its charge needs the row.
      if (stake.status === 'charging') throw new ConvexError(CHARGING_ERROR);
      // Armed since `prepare`, on another device.
      if (stake.status === 'armed') await cancelJob(ctx, stake.resolveJobId);
      await ctx.db.delete('stakes', stake._id);
    },
  ),
  // Proof outliving a deleted goal (`evidence.ts`), which the step above can't reach.
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('goalSubmissions')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit),
    async (ctx, submission) => {
      for (const photoId of submission.photoIds) await ctx.storage.delete(photoId);
      await ctx.db.delete('goalSubmissions', submission._id);
    },
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('chargeReviews')
        .withIndex('by_user_and_status', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('chargeReviews', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('friends')
        .withIndex('by_user_and_email', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('friends', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('freezes')
        .withIndex('by_user_and_status', (q) => q.eq('userId', userId))
        .take(limit),
    async (ctx, freeze) => {
      await cancelJob(ctx, freeze.liftJobId);
      await ctx.db.delete('freezes', freeze._id);
    },
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('accomplishments')
        .withIndex('by_user_and_seen_and_achieved', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('accomplishments', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('endedHabits')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('endedHabits', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('contracts')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('contracts', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('lockouts')
        .withIndex('by_user_and_status', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('lockouts', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('reentryPayments')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('reentryPayments', row._id),
  ),
  plain(
    (ctx, userId, limit) =>
      ctx.db
        .query('subscriptions')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit),
    (ctx, row) => ctx.db.delete('subscriptions', row._id),
  ),
];

/**
 * Deletes up to `PURGE_BATCH` of the user's documents, table by table, and
 * the `users` row once nothing else is left. The caller repeats it until done.
 */
export const purgeBatch = internalMutation({
  args: { userId: v.id('users') },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, args): Promise<{ done: boolean }> => {
    let budget = PURGE_BATCH;
    for (const step of STEPS) {
      budget -= await step(ctx, args.userId, budget);
      if (budget <= 0) return { done: false };
    }

    if ((await ctx.db.get('users', args.userId)) !== null) {
      await ctx.db.delete('users', args.userId);
    }
    return { done: true };
  },
});
