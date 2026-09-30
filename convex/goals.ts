import { ConvexError, v, type Infer } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { recordKeptGoal } from './accomplishments';
import { newIconFields, repickIconOnRename, requireNewIcon } from './commitmentIcons';
import { friendInputValidator, resolveFriend } from './friends';
import { getCurrentUserOrNull } from './lib/auth';
import { requireCommitmentIcon } from './lib/commitmentIcons';
import { requireCommitmentText } from './lib/commitmentText';
import { authedAction, authedMutation, authedQuery } from './lib/customFunctions';
import { requirePro } from './lib/entitlements';
import { requireDevOverrides, requireUnlocked } from './lib/lockout';
import { touchReminders } from './lib/notify';
import {
  isStakeLive as isStakeViewLive,
  stakeView,
  stakeViewValidator,
  type StakeView,
} from './lib/stakeRules';
import { materializeGoalStake, releaseStake } from './lib/stakes';
import { moneyFields } from './lib/stakeSchema';
import schema, { stakeValidator, submissionStatusValidator } from './schema';
import {
  armStake,
  cardSetupValidator,
  dropGoalStake,
  mintCardSetup,
  moneyTotals,
  reuseCard,
  verifySavedCard,
  type CardSetup,
  type SavedCard,
} from './stakes';

/**
 * Goals: one-off commitments with a deadline and, optionally, a stake: money
 * or a friend who hears about a miss. A goal is only ever completed through an
 * approved submission (`goalSubmissions.ts`); a staked goal that reaches
 * `dueAt` uncompleted comes due in `stakes.resolveGoal`.
 */

export { MAX_STAKE_CENTS, MIN_STAKE_CENTS } from './lib/stakeRules';

/** A deadline has to be at least this far out, so a settlement is never scheduled in the past. */
export const MIN_LEAD_MS = 60 * 1000;

const goalValidator = schema.doc('goals');

/**
 * The latest submission, only while the goal is still open. `pending` means
 * "verifying"; `rejected` or `failed` carries the message to show on the card.
 */
const submissionSummaryValidator = v.object({
  status: submissionStatusValidator,
  reason: v.optional(v.string()),
});

const goalWithStatusValidator = goalValidator.extend({
  submission: v.union(submissionSummaryValidator, v.null()),
  /** What's on the line; `null` means just their word. */
  stakeView: v.union(stakeViewValidator, v.null()),
});

export type GoalSubmissionSummary = {
  status: Doc<'goalSubmissions'>['status'];
  reason?: string;
};

export type GoalWithStatus = Doc<'goals'> & {
  submission: GoalSubmissionSummary | null;
  stakeView: StakeView | null;
};

type LegacyStake = Infer<typeof stakeValidator>;

type AuthedCtx<T> = T & { user: Doc<'users'> };

export async function requireOwnedGoal(
  ctx: AuthedCtx<QueryCtx | MutationCtx>,
  goalId: Id<'goals'>,
): Promise<Doc<'goals'>> {
  const goal = await ctx.db.get('goals', goalId);
  if (goal === null) {
    throw new Error('Goal not found');
  }

  if (goal.userId !== ctx.user._id) {
    throw new Error('Unauthorized: this goal belongs to another user');
  }

  return goal;
}

async function latestSubmission(
  ctx: QueryCtx | MutationCtx,
  goalId: Id<'goals'>,
): Promise<Doc<'goalSubmissions'> | null> {
  return await ctx.db
    .query('goalSubmissions')
    .withIndex('by_goal', (q) => q.eq('goalId', goalId))
    .order('desc')
    .first();
}

async function withStatus(
  ctx: QueryCtx | MutationCtx,
  goal: Doc<'goals'>,
): Promise<GoalWithStatus> {
  const stakeRow = goal.stakeId === undefined ? null : await ctx.db.get('stakes', goal.stakeId);
  const base = {
    ...goal,
    // Builds from before the `stakes` table read money off `stake`.
    stake: stakeRow === null ? goal.stake : legacyStake(stakeRow),
    stakeView: stakeRow === null ? null : stakeView(stakeRow),
  };
  if (goal.completedAt !== undefined) {
    return { ...base, submission: null };
  }

  const latest = await latestSubmission(ctx, goal._id);

  return {
    ...base,
    submission: latest === null ? null : { status: latest.status, reason: latest.reason },
  };
}

/** A money row in the shape `goals.stake` had, for older builds. */
function legacyStake(stake: Doc<'stakes'>): LegacyStake | undefined {
  if (stake.kind !== 'money') return undefined;
  return {
    amountCents: stake.amountCents,
    stripeCustomerId: stake.stripeCustomerId,
    stripePaymentMethodId: stake.stripePaymentMethodId,
    stripeSetupIntentId: stake.stripeSetupIntentId ?? '',
    status: stake.status,
    stripePaymentIntentId: stake.stripePaymentIntentId,
    chargedAt: stake.chargedAt,
    failureReason: stake.failureReason,
    refundedCents: stake.refundedCents,
    refundedAt: stake.refundedAt,
    stripeDisputeId: stake.stripeDisputeId,
    disputedAt: stake.disputedAt,
  };
}

/**
 * Marks the goal done and lets the stake go. Called from `goalSubmissions.resolve`
 * in the same transaction as the verdict, so an approval can never be charged.
 * A stake that already came due is left alone: the charge is already in flight.
 */
export async function completeGoal(ctx: MutationCtx, goal: Doc<'goals'>): Promise<void> {
  if (goal.completedAt !== undefined) return;

  const stake = await materializeGoalStake(ctx, goal);
  if (stake !== null) await releaseStake(ctx, stake);

  const now = Date.now();
  await ctx.db.patch('goals', goal._id, { completedAt: now });
  await recordKeptGoal(ctx, goal, stake?._id, now);
}

function requireLead(dueAt: number): void {
  if (!Number.isFinite(dueAt) || dueAt < Date.now() + MIN_LEAD_MS) {
    throw new ConvexError('The deadline has to be at least a minute from now');
  }
}

async function nextOrder(ctx: MutationCtx, userId: Id<'users'>): Promise<number> {
  const existing = await ctx.db
    .query('goals')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();

  return existing.reduce((max, goal) => Math.max(max, goal.order), -1) + 1;
}

/**
 * Same tolerance as `habits.list`: a missing user row on first sign-in resolves
 * itself once `users.storeUser` lands.
 */
export const list = query({
  args: {},
  returns: v.array(goalWithStatusValidator),
  handler: async (ctx): Promise<GoalWithStatus[]> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) {
      return [];
    }

    const goals = await ctx.db
      .query('goals')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();

    // Soonest deadline first, so what's pressing stays on top.
    goals.sort((a, b) => a.dueAt - b.dueAt || a.order - b.order);

    return await Promise.all(goals.map((goal) => withStatus(ctx, goal)));
  },
});

/** Kept for builds from before `stakes.totals`. */
export const stakeTotals = query({
  args: {},
  returns: v.object({ onTheLineCents: v.number(), keptCents: v.number() }),
  handler: async (ctx): Promise<{ onTheLineCents: number; keptCents: number }> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return { onTheLineCents: 0, keptCents: 0 };
    const { onTheLineCents, keptCents } = await moneyTotals(ctx, user._id);
    return { onTheLineCents, keptCents };
  },
});

export const get = authedQuery({
  args: { goalId: v.id('goals') },
  returns: v.union(goalWithStatusValidator, v.null()),
  handler: async (ctx, args): Promise<GoalWithStatus | null> => {
    const goal = await ctx.db.get('goals', args.goalId);
    if (goal === null || goal.userId !== ctx.user._id) {
      return null;
    }

    return await withStatus(ctx, goal);
  },
});

/**
 * A goal on the user's word, or with a friend who hears about a miss. Money
 * goes through `createStaked`, which has to check the card with Stripe first.
 */
export const create = authedMutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    dueAt: v.number(),
    stake: v.optional(v.object({ kind: v.literal('friend'), friend: friendInputValidator })),
    ...newIconFields,
  },
  returns: v.id('goals'),
  handler: async (ctx, args): Promise<Id<'goals'>> => {
    await requireUnlocked(ctx, ctx.user._id);
    await requirePro(ctx, ctx.user._id);
    requireLead(args.dueAt);
    requireCommitmentText(args.title, args.description);
    const icon = requireNewIcon(args);
    const friend =
      args.stake === undefined ? null : await resolveFriend(ctx, ctx.user, args.stake.friend);

    const goalId = await ctx.db.insert('goals', {
      userId: ctx.user._id,
      title: args.title,
      description: args.description,
      dueAt: args.dueAt,
      ...icon,
      order: await nextOrder(ctx, ctx.user._id),
    });
    if (friend !== null) {
      const goal = await ctx.db.get('goals', goalId);
      if (goal !== null) await armStake(ctx, { goal }, { kind: 'friend', friend });
    }
    await touchReminders(ctx, ctx.user._id);

    return goalId;
  },
});

/** Kept for builds from before `stakes.beginMoney`. */
export const beginStake = authedAction({
  args: { amountCents: v.number() },
  returns: cardSetupValidator,
  handler: async (ctx, args): Promise<CardSetup> => await mintCardSetup(ctx, args.amountCents),
});

/**
 * A goal with money on it, once the PaymentSheet saved the card. Only
 * Stripe's copy of the SetupIntent is trusted (`stakes.verifySavedCard`).
 */
export const createStaked = authedAction({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    dueAt: v.number(),
    amountCents: v.number(),
    /** A card just saved through the PaymentSheet… */
    setupIntentId: v.optional(v.string()),
    /** …or the one an earlier stake of theirs was on ("set it again"). */
    reuseFromStakeId: v.optional(v.id('stakes')),
    ...newIconFields,
  },
  returns: v.id('goals'),
  handler: async (ctx, args): Promise<Id<'goals'>> => {
    requireLead(args.dueAt);
    requireCommitmentText(args.title, args.description);
    let saved: SavedCard;
    if (args.setupIntentId !== undefined) {
      saved = await verifySavedCard(ctx, args.setupIntentId, args.amountCents);
    } else if (args.reuseFromStakeId !== undefined) {
      saved = await reuseCard(ctx, args.reuseFromStakeId, args.amountCents);
    } else {
      throw new ConvexError('Add a card for the stake');
    }
    const { kind: _kind, ...card } = saved;

    const goalId: Id<'goals'> = await ctx.runMutation(internal.goals.insertStaked, {
      userId: ctx.user._id,
      title: args.title,
      description: args.description,
      dueAt: args.dueAt,
      icon: args.icon,
      iconChosen: args.iconChosen,
      ...card,
    });

    return goalId;
  },
});

export const insertStaked = internalMutation({
  args: {
    userId: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    dueAt: v.number(),
    amountCents: moneyFields.amountCents,
    stripeCustomerId: moneyFields.stripeCustomerId,
    stripePaymentMethodId: moneyFields.stripePaymentMethodId,
    stripeSetupIntentId: moneyFields.stripeSetupIntentId,
    cardBrand: moneyFields.cardBrand,
    cardLast4: moneyFields.cardLast4,
    ...newIconFields,
  },
  returns: v.id('goals'),
  handler: async (ctx, args): Promise<Id<'goals'>> => {
    await requireUnlocked(ctx, args.userId);
    await requirePro(ctx, args.userId);
    requireLead(args.dueAt);
    const { userId, title, description, dueAt, icon, iconChosen, ...card } = args;

    const goalId = await ctx.db.insert('goals', {
      userId,
      title,
      description,
      dueAt,
      ...requireNewIcon({ icon, iconChosen }),
      order: await nextOrder(ctx, userId),
    });
    const goal = await ctx.db.get('goals', goalId);
    if (goal === null) throw new Error('Goal not found');
    // Checks the cap and replays; throwing here rolls the goal back with it.
    await armStake(ctx, { goal }, { kind: 'money', ...card });
    await touchReminders(ctx, userId);

    return goalId;
  },
});

/**
 * The deadline is part of the commitment: it can only move while nothing is
 * staked on it and the goal is still open.
 */
export const update = authedMutation({
  args: {
    goalId: v.id('goals'),
    title: v.optional(v.string()),
    // `null` clears the field; omitting it leaves the stored value alone.
    description: v.optional(v.union(v.string(), v.null())),
    dueAt: v.optional(v.number()),
    /** Picked by hand, so it sticks through later renames. */
    icon: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const goal = await requireOwnedGoal(ctx, args.goalId);
    await requireUnlocked(ctx, ctx.user._id);
    requireCommitmentText(args.title ?? goal.title, args.description);
    requireCommitmentIcon(args.icon);

    const fields: Partial<Doc<'goals'>> = {};
    if (args.title !== undefined) fields.title = args.title;
    if (args.description !== undefined) {
      fields.description = args.description ?? undefined;
    }
    if (args.dueAt !== undefined && args.dueAt !== goal.dueAt) {
      if (goal.stake !== undefined || goal.stakeId !== undefined) {
        throw new ConvexError('The deadline is locked once something is staked on the goal');
      }
      if (goal.completedAt !== undefined) {
        throw new ConvexError('The goal is already done');
      }
      requireLead(args.dueAt);
      fields.dueAt = args.dueAt;
    }
    if (args.icon !== undefined) {
      fields.icon = args.icon;
      fields.iconChosen = true;
    }

    if (Object.keys(fields).length > 0) {
      await ctx.db.patch('goals', args.goalId, fields);
    }
    await repickIconOnRename(ctx, { kind: 'goal', id: goal._id }, goal, args);
    // A new deadline re-arms its reminders; the old one's simply stop matching.
    if (fields.dueAt !== undefined) {
      await touchReminders(ctx, ctx.user._id);
    }

    return null;
  },
});

/**
 * A goal with something staked on it runs to its deadline: deleting it would
 * call the bet off, so that is refused until it resolves (or is released by
 * proof). `force` calls it off anyway, on dev and preview only.
 */
export const remove = authedMutation({
  args: { goalId: v.id('goals'), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const goal = await requireOwnedGoal(ctx, args.goalId);
    await requireUnlocked(ctx, ctx.user._id);

    const stake = await materializeGoalStake(ctx, goal);
    if (args.force === true) {
      requireDevOverrides();
    } else if (stake !== null && isStakeViewLive(stake)) {
      throw new ConvexError(
        stake.kind === 'money'
          ? 'A goal with money on it runs to its deadline'
          : 'A goal with a friend on it runs to its deadline',
      );
    }

    if (stake !== null) {
      await dropGoalStake(ctx, stake);
    }

    const submissions = await ctx.db
      .query('goalSubmissions')
      .withIndex('by_goal', (q) => q.eq('goalId', args.goalId))
      .take(100);
    for (const submission of submissions) {
      for (const photoId of submission.photoIds) {
        await ctx.storage.delete(photoId);
      }
      await ctx.db.delete('goalSubmissions', submission._id);
    }

    await ctx.db.delete('goals', args.goalId);

    return null;
  },
});
