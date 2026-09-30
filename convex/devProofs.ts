import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { requireOwnedGoal } from './goals';
import { requireOwnedHabit } from './habits';
import { authedMutation } from './lib/customFunctions';
import { requireDevOverrides } from './lib/lockout';
import { touchReminders } from './lib/notify';
import { materializeGoalStake } from './lib/stakes';

/**
 * Developer tools for trying a proof method again: they undo a log as if it
 * never happened. Only on deployments with `ANTE_DEV_OVERRIDES=1` (dev and
 * preview), like every other dev override.
 */

const MAX_ROWS = 100;
const MAX_ACCOMPLISHMENTS = 500;

/**
 * Forgets `day` for a habit: its log, every check (photo, place or timer)
 * and any timer run, so the day is open and can be proven again. A check
 * still being judged is dropped too; its scheduled verdict finds nothing and
 * does nothing.
 */
export const resetHabitDay = authedMutation({
  args: { habitId: v.id('habits'), day: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireDevOverrides();
    const habit = await requireOwnedHabit(ctx, args.habitId);
    const byDay = { habitId: habit._id, day: args.day };

    const completions = await ctx.db
      .query('habitCompletions')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', byDay.habitId).eq('day', byDay.day))
      .take(MAX_ROWS);
    for (const row of completions) await ctx.db.delete('habitCompletions', row._id);

    const verifications = await ctx.db
      .query('habitVerifications')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', byDay.habitId).eq('day', byDay.day))
      .take(MAX_ROWS);
    for (const row of verifications) {
      await deletePhotos(ctx, row.photoId === undefined ? [] : [row.photoId]);
      await ctx.db.delete('habitVerifications', row._id);
    }

    const runs = await ctx.db
      .query('habitTimerRuns')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', byDay.habitId).eq('day', byDay.day))
      .take(MAX_ROWS);
    for (const row of runs) await ctx.db.delete('habitTimerRuns', row._id);

    // Today is due again, so its reminder is back on.
    await touchReminders(ctx, ctx.user._id);
    return null;
  },
});

/**
 * Reopens a goal: its submissions go, it's no longer done, its Kept moment is
 * forgotten, and a stake that proving it released is armed again, due at the
 * same deadline. Refused once the deadline has passed, since a new proof
 * would be too.
 */
export const resetGoalProof = authedMutation({
  args: { goalId: v.id('goals') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireDevOverrides();
    const goal = await requireOwnedGoal(ctx, args.goalId);
    if (goal.dueAt <= Date.now()) {
      throw new ConvexError('The deadline has passed. Move it later first, then reset.');
    }

    const submissions = await ctx.db
      .query('goalSubmissions')
      .withIndex('by_goal', (q) => q.eq('goalId', goal._id))
      .take(MAX_ROWS);
    for (const row of submissions) {
      await deletePhotos(ctx, row.photoIds);
      await ctx.db.delete('goalSubmissions', row._id);
    }

    const accomplishments = await ctx.db
      .query('accomplishments')
      .withIndex('by_user_and_seen_and_achieved', (q) => q.eq('userId', ctx.user._id))
      .take(MAX_ACCOMPLISHMENTS);
    for (const row of accomplishments) {
      if (row.goalId === goal._id) await ctx.db.delete('accomplishments', row._id);
    }

    const stake = await materializeGoalStake(ctx, goal);
    if (stake !== null && stake.status === 'released') {
      const resolveJobId = await ctx.scheduler.runAt(goal.dueAt, internal.stakes.resolveGoal, {
        stakeId: stake._id,
        attempt: 0,
      });
      await ctx.db.patch('stakes', stake._id, {
        status: 'armed',
        releasedAt: undefined,
        resolveJobId,
      });
    }

    await ctx.db.patch('goals', goal._id, { completedAt: undefined });
    await touchReminders(ctx, ctx.user._id);
    return null;
  },
});

async function deletePhotos(ctx: MutationCtx, photoIds: Id<'_storage'>[]): Promise<void> {
  for (const photoId of photoIds) {
    // Already gone is fine: the point is only that nothing is left behind.
    if ((await ctx.db.system.get('_storage', photoId)) !== null) {
      await ctx.storage.delete(photoId);
    }
  }
}
