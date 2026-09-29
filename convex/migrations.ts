import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import { daysBefore, nextDay } from './lib/days';
import { localDay } from './lib/lockout';
import { touchReminders } from './lib/notify';
import { DEFAULT_LOCKOUT_DAYS } from './lib/stakeRules';
import { materializeGoalStake } from './lib/stakes';
import { zonedInstant } from './lib/zonedTime';
import { armStake } from './stakes';

/**
 * One-off moves for the stakes redesign. Each is idempotent and pages through
 * its table, chaining itself until done; `status` counts what's left. Run
 * from a machine with deploy access, e.g.:
 *
 *   bunx convex run --prod migrations:goalStakesToTable
 *   bunx convex run --prod migrations:status
 *
 * Order: `goalStakesToTable` any time after deploy (goal stakes are also moved
 * lazily whenever they're touched). At cutover, set `STAKES_V2=on`, then run
 * `habitsToLockoutStakes` and `feeLockoutsToFreezes`, then release the app.
 */

const BATCH = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Goal money from the old embedded `goals.stake` into its own `stakes` row. */
export const goalStakesToTable = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db
      .query('goals')
      .paginate({ numItems: BATCH, cursor: args.cursor ?? null });
    for (const goal of page.page) {
      if (goal.stake !== undefined && goal.stakeId === undefined) {
        await materializeGoalStake(ctx, goal);
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.goalStakesToTable, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

/**
 * Habits made under the re-entry fee were signed as "miss one and Ante
 * locks". The closest honest stake is a lockout of the default length, with
 * no fee. `before` keeps habits made later on the user's word alone: pass the
 * cutover time, and it's safe to run again.
 */
export const habitsToLockoutStakes = internalMutation({
  args: { before: v.number(), cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db
      .query('habits')
      .paginate({ numItems: BATCH, cursor: args.cursor ?? null });
    for (const habit of page.page) {
      if (habit.stakeId !== undefined || habit.brokenAt !== undefined) continue;
      if (habit._creationTime >= args.before || habit.endsAfter !== undefined) continue;
      await armStake(ctx, { habit }, { kind: 'lockout', days: DEFAULT_LOCKOUT_DAYS });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.habitsToLockoutStakes, {
        before: args.before,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

/**
 * Whoever is locked waiting on the fee at cutover gets the new deal: a freeze
 * that ends three days after they were locked, or, if that has passed, back
 * in now with today free.
 */
export const feeLockoutsToFreezes = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now();
    const page = await ctx.db
      .query('lockouts')
      .paginate({ numItems: BATCH, cursor: args.cursor ?? null });

    for (const lockout of page.page) {
      if (lockout.status !== 'active') continue;
      await ctx.db.patch('lockouts', lockout._id, { status: 'paid', paidAt: now, waived: true });

      const user = await ctx.db.get('users', lockout.userId);
      if (user === null) continue;
      const timeZone = user.timeZone ?? 'UTC';
      const today = localDay(now, timeZone);
      const lockDay = localDay(lockout.lockedAt, timeZone);
      const endDay = daysBefore(lockDay, -(DEFAULT_LOCKOUT_DAYS - 1));

      if (lockout.lockedAt + DEFAULT_LOCKOUT_DAYS * DAY_MS > now && endDay >= today) {
        const endsAt = zonedInstant(nextDay(endDay), 0, 0, timeZone);
        const freezeId = await ctx.db.insert('freezes', {
          userId: user._id,
          startDay: lockDay,
          endDay,
          endsAt,
          days: DEFAULT_LOCKOUT_DAYS,
          status: 'active',
          createdAt: now,
        });
        const liftJobId = await ctx.scheduler.runAt(endsAt, internal.freezes.lift, { freezeId });
        await ctx.db.patch('freezes', freezeId, { liftJobId });
      } else {
        // The old unlock: today is free, and the locked days are never judged.
        await ctx.db.patch('users', user._id, {
          accountableFrom: nextDay(today),
          lastCheckedDay: today,
        });
      }
      await touchReminders(ctx, user._id);
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.feeLockoutsToFreezes, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

/** What each migration still has left to do. */
export const status = internalQuery({
  args: {},
  returns: v.object({
    goalStakesLeft: v.number(),
    habitsWithoutStakes: v.number(),
    activeFeeLockouts: v.number(),
  }),
  handler: async (ctx) => {
    let goalStakesLeft = 0;
    for await (const goal of ctx.db.query('goals')) {
      if (goal.stake !== undefined && goal.stakeId === undefined) goalStakesLeft += 1;
    }
    let habitsWithoutStakes = 0;
    for await (const habit of ctx.db.query('habits')) {
      if (habit.stakeId === undefined && habit.brokenAt === undefined) habitsWithoutStakes += 1;
    }
    let activeFeeLockouts = 0;
    for await (const lockout of ctx.db.query('lockouts')) {
      if (lockout.status === 'active') activeFeeLockouts += 1;
    }
    return { goalStakesLeft, habitsWithoutStakes, activeFeeLockouts };
  },
});
