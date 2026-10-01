import { ConvexError, v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { query, type MutationCtx, type QueryCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import {
  isGoalOpen,
  isHabitActive,
  limitFor,
  limitMessage,
  MAX_ACTIVE_HABITS,
  MAX_OPEN_GOALS,
  type LimitedKind,
} from './lib/commitmentLimits';

/**
 * The cap on commitments going at once (`lib/commitmentLimits.ts`): counted
 * here, checked by every mutation that makes a habit or a goal.
 */

/** Far above the cap, and far above what anyone keeps around. */
const MAX_HABIT_ROWS = 200;
/** Goals pile up as they finish; the open ones are among the newest. */
const MAX_GOAL_ROWS = 500;

async function countGoing(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  now: number,
): Promise<{ habits: number; goals: number }> {
  const habits = await ctx.db
    .query('habits')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(MAX_HABIT_ROWS);
  const goals = await ctx.db
    .query('goals')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .order('desc')
    .take(MAX_GOAL_ROWS);
  return {
    habits: habits.filter(isHabitActive).length,
    goals: goals.filter((goal) => isGoalOpen(goal, now)).length,
  };
}

/**
 * Refuses a new habit or goal, or bringing a habit back (a restart, taking
 * back an ending), once the user has as many going as Ante allows.
 * Called inside the mutation that inserts it, so two made at once can't both
 * slip under.
 */
export async function requireRoomFor(
  ctx: MutationCtx,
  userId: Id<'users'>,
  kind: LimitedKind,
): Promise<void> {
  const going = await countGoing(ctx, userId, Date.now());
  if ((kind === 'habit' ? going.habits : going.goals) >= limitFor(kind)) {
    throw new ConvexError(limitMessage(kind));
  }
}

const slotsValidator = v.object({ used: v.number(), max: v.number() });

/** How many of each are going, against the cap. `now` comes from the client, so it stays fresh. */
export const room = query({
  args: { now: v.number() },
  returns: v.object({ habits: slotsValidator, goals: slotsValidator }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    const going =
      user === null ? { habits: 0, goals: 0 } : await countGoing(ctx, user._id, args.now);
    return {
      habits: { used: going.habits, max: MAX_ACTIVE_HABITS },
      goals: { used: going.goals, max: MAX_OPEN_GOALS },
    };
  },
});
