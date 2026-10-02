import { ConvexError, v, type Infer } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { isCallOffOpen } from './lib/callOff';
import { authedQuery } from './lib/customFunctions';
import { proofMethodValidator } from './lib/proofMethods';
import { lockoutDaysValidator } from './lib/stakeSchema';
import { dropGoalStake } from './stakes';

/**
 * Calling a commitment off in its first moments (`lib/callOff.ts`): the deal
 * never stood, so its stake is let go without a word to anyone and its signed
 * contract goes with it. Deleting the commitment itself is left to
 * `goals.ts` and `habits.ts`, which own their own cleanup.
 */

/** Refuses once the window has closed, or for a commitment that never had one. */
export function requireCallOffOpen(
  commitment: Doc<'goals'> | Doc<'habits'>,
  now: number,
  message = 'It’s past the time to call this off',
): number {
  const { callOffUntil } = commitment;
  if (callOffUntil === undefined || !isCallOffOpen(callOffUntil, now)) {
    throw new ConvexError(message);
  }
  return callOffUntil;
}

/**
 * Lets the stake go (a friend's is void: they were never told) and drops the
 * signed contract. Their heads-up was held until the window closed, and it
 * bails on a stake that's no longer armed.
 */
export async function voidDeal(
  ctx: MutationCtx,
  target: { goal: Doc<'goals'> } | { habit: Doc<'habits'> },
): Promise<void> {
  const commitment = 'goal' in target ? target.goal : target.habit;
  if (commitment.stakeId !== undefined) {
    const stake = await ctx.db.get('stakes', commitment.stakeId);
    if (stake !== null) await dropGoalStake(ctx, stake);
  }

  const contracts =
    'goal' in target
      ? await ctx.db
          .query('contracts')
          .withIndex('by_goal', (q) => q.eq('goalId', target.goal._id))
          .take(20)
      : await ctx.db
          .query('contracts')
          .withIndex('by_habit', (q) => q.eq('habitId', target.habit._id))
          .take(20);
  for (const contract of contracts) {
    await ctx.db.delete('contracts', contract._id);
  }
}

const revisableStakeValidator = v.union(
  v.object({
    kind: v.literal('money'),
    stakeId: v.id('stakes'),
    amountCents: v.number(),
    cardBrand: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('friend'),
    friendId: v.id('friends'),
    name: v.string(),
    email: v.string(),
  }),
  v.object({ kind: v.literal('lockout'), days: lockoutDaysValidator }),
);

const revisableValidator = v.object({
  kind: v.union(v.literal('goal'), v.literal('habit')),
  title: v.string(),
  description: v.optional(v.string()),
  /** Goals only. */
  dueAt: v.optional(v.number()),
  /** Habits only. */
  timesPerWeek: v.optional(v.number()),
  proofMethod: v.optional(proofMethodValidator),
  timerMinutes: v.optional(v.number()),
  icon: v.optional(v.string()),
  iconChosen: v.optional(v.boolean()),
  callOffUntil: v.number(),
  /** The armed stake, or `null` for just their word. */
  stake: v.union(revisableStakeValidator, v.null()),
});

export type Revisable = Infer<typeof revisableValidator>;

/**
 * What the New flow needs to reopen a commitment with its terms filled in.
 * `null` if it isn't theirs or never had a window; whether the window is
 * still open is the caller's to check against its clock, and the swap
 * itself re-checks.
 */
export const revisable = authedQuery({
  args: { goalId: v.optional(v.id('goals')), habitId: v.optional(v.id('habits')) },
  returns: v.union(revisableValidator, v.null()),
  handler: async (ctx, args): Promise<Revisable | null> => {
    const commitment =
      args.goalId !== undefined
        ? await ctx.db.get('goals', args.goalId)
        : args.habitId !== undefined
          ? await ctx.db.get('habits', args.habitId)
          : null;
    if (commitment === null || commitment.userId !== ctx.user._id) return null;
    if (commitment.callOffUntil === undefined) return null;

    const stake =
      commitment.stakeId === undefined ? null : await ctx.db.get('stakes', commitment.stakeId);
    const common = {
      title: commitment.title,
      description: commitment.description,
      icon: commitment.icon,
      iconChosen: commitment.iconChosen,
      callOffUntil: commitment.callOffUntil,
      stake: stake === null || stake.status !== 'armed' ? null : revisableStake(stake),
    };

    if ('dueAt' in commitment) {
      if (commitment.completedAt !== undefined) return null;
      return { kind: 'goal', dueAt: commitment.dueAt, ...common };
    }
    if (commitment.endsAfter !== undefined || commitment.brokenAt !== undefined) return null;
    return {
      kind: 'habit',
      timesPerWeek: commitment.timesPerWeek,
      proofMethod: commitment.proofMethod,
      timerMinutes: commitment.timerMinutes,
      ...common,
    };
  },
});

function revisableStake(stake: Doc<'stakes'>): Revisable['stake'] {
  switch (stake.kind) {
    case 'money':
      return {
        kind: 'money',
        stakeId: stake._id,
        amountCents: stake.amountCents,
        cardBrand: stake.cardBrand,
        cardLast4: stake.cardLast4,
      };
    case 'friend':
      return {
        kind: 'friend',
        friendId: stake.friendId,
        name: stake.friendName,
        email: stake.friendEmail,
      };
    case 'lockout':
      return { kind: 'lockout', days: stake.days };
  }
}
