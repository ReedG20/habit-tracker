import { v, type Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type MutationCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { authedMutation } from './lib/customFunctions';
import { endedHabitOutcomeValidator } from './lib/endedHabitSchema';
import { stakeView, stakeViewValidator, type StakeView } from './lib/stakeRules';

/**
 * Deleted habits, as the Past list on Commitments shows them. `deleteHabit`
 * records each one on its way out.
 */

/** As many as the list shows: the newest. */
const MAX_LISTED = 50;

/**
 * Notes a habit about to be deleted. One never logged and never lost was most
 * likely a mistake, and leaves nothing behind.
 */
export async function recordEndedHabit(
  ctx: MutationCtx,
  habit: Doc<'habits'>,
  completions: number,
  accomplishmentId: Id<'accomplishments'> | undefined,
): Promise<void> {
  if (completions === 0 && habit.brokenAt === undefined) return;
  await ctx.db.insert('endedHabits', {
    userId: habit.userId,
    title: habit.title,
    icon: habit.icon,
    outcome:
      habit.brokenAt !== undefined ? 'lost' : accomplishmentId !== undefined ? 'kept' : 'ended',
    completions,
    startedAt: habit._creationTime,
    endedAt: Date.now(),
    stakeId: habit.stakeId,
    accomplishmentId,
  });
}

export const endedHabitViewValidator = v.object({
  _id: v.id('endedHabits'),
  title: v.string(),
  icon: v.optional(v.string()),
  outcome: endedHabitOutcomeValidator,
  completions: v.number(),
  startedAt: v.number(),
  endedAt: v.number(),
  stakeId: v.optional(v.id('stakes')),
  /** What was on it and how it ended, so the Past row can show the money. */
  stakeView: v.union(stakeViewValidator, v.null()),
  accomplishmentId: v.optional(v.id('accomplishments')),
});

export type EndedHabitView = Infer<typeof endedHabitViewValidator>;

/** Newest first. Tolerates a missing user row, like `habits.list`. */
export const list = query({
  args: {},
  returns: v.array(endedHabitViewValidator),
  handler: async (ctx): Promise<EndedHabitView[]> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return [];

    // Rows go in as habits end, so creation order is end order.
    const rows = await ctx.db
      .query('endedHabits')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(MAX_LISTED);

    return await Promise.all(
      rows.map(async (row) => {
        const stake = row.stakeId === undefined ? null : await ctx.db.get('stakes', row.stakeId);
        const view: StakeView | null = stake === null ? null : stakeView(stake);
        return {
          _id: row._id,
          title: row.title,
          icon: row.icon,
          outcome: row.outcome,
          completions: row.completions,
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          stakeId: row.stakeId,
          stakeView: view,
          accomplishmentId: row.accomplishmentId,
        };
      }),
    );
  },
});

/** Takes one off the Past list. Only the summary goes: its stake and Kept rows stay. */
export const remove = authedMutation({
  args: { endedHabitId: v.id('endedHabits') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get('endedHabits', args.endedHabitId);
    if (row === null) return null;
    if (row.userId !== ctx.user._id) throw new Error('Unauthorized');
    await ctx.db.delete('endedHabits', row._id);
    return null;
  },
});
