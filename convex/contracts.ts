import { v, type Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { contractRunValidator, signatureValidator } from './lib/contractSchema';
import { authedMutation } from './lib/customFunctions';

/**
 * The contract a commitment was signed on, kept so its ending can show it
 * again: the Kept screen stamps it kept, the loss screen stamps it missed.
 * Signing saves it after the commitment is made, so a failed save only costs
 * the card on those screens, never the commitment.
 */

const MAX_RUNS = 24;
const MAX_RUN_LENGTH = 300;
const MAX_STROKES = 64;
const MAX_PATH_CHARACTERS = 40_000;
const MAX_PAD_SIZE = 2_000;
/** What `SignaturePad` writes: moves, quadratic curves and lines, nothing else. */
const PATH = /^[MQLl0-9.,\s-]*$/;

const targetValidator = v.union(
  v.object({ habitId: v.id('habits') }),
  v.object({ goalId: v.id('goals') }),
);

export const signedContractValidator = v.object({
  kind: v.union(v.literal('habit'), v.literal('goal')),
  terms: v.array(contractRunValidator),
  signature: signatureValidator,
  signedAt: v.number(),
});

export type SignedContract = Infer<typeof signedContractValidator>;

function requireSignable(
  terms: Infer<typeof contractRunValidator>[],
  signature: Infer<typeof signatureValidator>,
): void {
  if (
    terms.length === 0 ||
    terms.length > MAX_RUNS ||
    terms.some((run) => run.text.length > MAX_RUN_LENGTH)
  ) {
    throw new Error('Contract terms are too long');
  }
  const { width, height, strokes } = signature;
  if (
    !(width > 0 && width <= MAX_PAD_SIZE && height > 0 && height <= MAX_PAD_SIZE) ||
    strokes.length === 0 ||
    strokes.length > MAX_STROKES ||
    strokes.reduce((total, stroke) => total + stroke.length, 0) > MAX_PATH_CHARACTERS ||
    !strokes.every((stroke) => PATH.test(stroke))
  ) {
    throw new Error('Invalid signature');
  }
}

/** Saves the contract the user just signed for one of their commitments. */
export const sign = authedMutation({
  args: {
    target: targetValidator,
    terms: v.array(contractRunValidator),
    signature: signatureValidator,
  },
  returns: v.id('contracts'),
  handler: async (ctx, args): Promise<Id<'contracts'>> => {
    requireSignable(args.terms, args.signature);
    const { terms, signature } = args;

    if ('habitId' in args.target) {
      const habit = await ctx.db.get('habits', args.target.habitId);
      if (habit === null || habit.userId !== ctx.user._id) throw new Error('Habit not found');
      return await ctx.db.insert('contracts', {
        userId: ctx.user._id,
        kind: 'habit',
        habitId: habit._id,
        terms,
        signature,
      });
    }

    const goal = await ctx.db.get('goals', args.target.goalId);
    if (goal === null || goal.userId !== ctx.user._id) throw new Error('Goal not found');
    return await ctx.db.insert('contracts', {
      userId: ctx.user._id,
      kind: 'goal',
      goalId: goal._id,
      terms,
      signature,
    });
  },
});

/** The newest contract signed for a commitment at or before `at`: the one an outcome then answers to. */
async function contractAsOf(
  ctx: QueryCtx,
  userId: Id<'users'>,
  commitment: { habitId?: Id<'habits'>; goalId?: Id<'goals'> },
  at: number,
): Promise<SignedContract | null> {
  let row: Doc<'contracts'> | null = null;
  if (commitment.habitId !== undefined) {
    const habitId = commitment.habitId;
    row = await ctx.db
      .query('contracts')
      .withIndex('by_habit', (q) => q.eq('habitId', habitId).lte('_creationTime', at))
      .order('desc')
      .first();
  } else if (commitment.goalId !== undefined) {
    const goalId = commitment.goalId;
    row = await ctx.db
      .query('contracts')
      .withIndex('by_goal', (q) => q.eq('goalId', goalId).lte('_creationTime', at))
      .order('desc')
      .first();
  }
  if (row === null || row.userId !== userId) return null;
  return {
    kind: row.kind,
    terms: row.terms,
    signature: row.signature,
    signedAt: row._creationTime,
  };
}

/** The contract behind a Kept screen, if one was signed. */
export const forKept = query({
  args: { accomplishmentId: v.id('accomplishments') },
  returns: v.union(signedContractValidator, v.null()),
  handler: async (ctx, args): Promise<SignedContract | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const row = await ctx.db.get('accomplishments', args.accomplishmentId);
    if (row === null || row.userId !== user._id) return null;
    // A habit is gone by now, but its stake still says which habit it was.
    const stake = row.stakeId === undefined ? null : await ctx.db.get('stakes', row.stakeId);
    const commitment =
      row.goalId !== undefined
        ? { goalId: row.goalId }
        : { habitId: stake?.habitId, goalId: stake?.goalId };
    return await contractAsOf(ctx, user._id, commitment, row.achievedAt);
  },
});

/** The contract behind a loss screen, if one was signed. */
export const forLoss = query({
  args: { stakeId: v.id('stakes') },
  returns: v.union(signedContractValidator, v.null()),
  handler: async (ctx, args): Promise<SignedContract | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake === null || stake.userId !== user._id) return null;
    return await contractAsOf(
      ctx,
      user._id,
      { habitId: stake.habitId, goalId: stake.goalId },
      stake.lostAt ?? Number.MAX_SAFE_INTEGER,
    );
  },
});
