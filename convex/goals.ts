import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { requireCommitmentText } from './lib/commitmentText';
import { authedAction, authedMutation, authedQuery } from './lib/customFunctions';
import { stripeClient } from './lib/stripe';
import schema, { submissionStatusValidator } from './schema';

/**
 * Goals: one-off commitments with a deadline and, optionally, money on the
 * line. A goal is only ever completed through an approved submission
 * (`goalSubmissions.ts`); a staked goal that reaches `dueAt` uncompleted is
 * charged by `stripe.settle`.
 */

export const MIN_STAKE_CENTS = 100;
export const MAX_STAKE_CENTS = 5000;

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
});

export type GoalSubmissionSummary = {
  status: Doc<'goalSubmissions'>['status'];
  reason?: string;
};

export type GoalWithStatus = Doc<'goals'> & {
  submission: GoalSubmissionSummary | null;
};

export type Stake = NonNullable<Doc<'goals'>['stake']>;

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
  if (goal.completedAt !== undefined) {
    return { ...goal, submission: null };
  }

  const latest = await latestSubmission(ctx, goal._id);

  return {
    ...goal,
    submission: latest === null ? null : { status: latest.status, reason: latest.reason },
  };
}

/**
 * Cancels the pending settlement. `cancel` throws once the job has already
 * run, which is exactly the case where there is nothing left to cancel.
 */
async function cancelSettlement(ctx: MutationCtx, stake: Stake): Promise<void> {
  if (stake.settleJobId === undefined) return;

  try {
    await ctx.scheduler.cancel(stake.settleJobId);
  } catch {
    // Already ran or was cleaned up; the stake status is the source of truth.
  }
}

/**
 * Marks the goal done and lets the stake go. Called from `goalSubmissions.resolve`
 * in the same transaction as the verdict, so an approval can never be charged.
 * A stake mid-`charging` is left alone: the charge is already in flight.
 */
export async function completeGoal(ctx: MutationCtx, goal: Doc<'goals'>): Promise<void> {
  if (goal.completedAt !== undefined) return;

  const fields: Partial<Doc<'goals'>> = { completedAt: Date.now() };
  if (goal.stake?.status === 'armed') {
    await cancelSettlement(ctx, goal.stake);
    fields.stake = { ...goal.stake, status: 'released', settleJobId: undefined };
  }

  await ctx.db.patch('goals', goal._id, fields);
}

function requireLead(dueAt: number): void {
  if (!Number.isFinite(dueAt) || dueAt < Date.now() + MIN_LEAD_MS) {
    throw new Error('The deadline has to be at least a minute from now');
  }
}

function requireStakeAmount(amountCents: number): void {
  if (
    !Number.isInteger(amountCents) ||
    amountCents < MIN_STAKE_CENTS ||
    amountCents > MAX_STAKE_CENTS
  ) {
    throw new Error(
      `A stake has to be between $${MIN_STAKE_CENTS / 100} and $${MAX_STAKE_CENTS / 100}`,
    );
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

/** A goal with nothing on the line. Staked goals go through `createStaked`. */
export const create = authedMutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    dueAt: v.number(),
  },
  returns: v.id('goals'),
  handler: async (ctx, args): Promise<Id<'goals'>> => {
    requireLead(args.dueAt);
    requireCommitmentText(args.title, args.description);

    return await ctx.db.insert('goals', {
      userId: ctx.user._id,
      title: args.title,
      description: args.description,
      dueAt: args.dueAt,
      order: await nextOrder(ctx, ctx.user._id),
    });
  },
});

/**
 * Step one of putting money on a goal: mints what the PaymentSheet needs to
 * save a card for off-session use. Nothing is stored yet; the goal is created
 * by `createStaked` once the card is confirmed.
 */
export const beginStake = authedAction({
  args: { amountCents: v.number() },
  returns: v.object({
    customerId: v.string(),
    customerSessionClientSecret: v.string(),
    setupIntentClientSecret: v.string(),
    setupIntentId: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    customerId: string;
    customerSessionClientSecret: string;
    setupIntentClientSecret: string;
    setupIntentId: string;
  }> => {
    requireStakeAmount(args.amountCents);
    const stripe = stripeClient();

    let customerId = ctx.user.stripeCustomerId;
    if (customerId === undefined) {
      const customer = await stripe.customers.create({
        email: ctx.user.email.length > 0 ? ctx.user.email : undefined,
        name: ctx.user.name,
        metadata: { userId: ctx.user._id },
      });
      const stored: string = await ctx.runMutation(internal.users.setStripeCustomerId, {
        userId: ctx.user._id,
        stripeCustomerId: customer.id,
      });
      customerId = stored;
    }

    const session = await stripe.customerSessions.create({
      customer: customerId,
      components: {
        mobile_payment_element: {
          enabled: true,
          features: {
            // No "save for future purchases" checkbox: a SetupIntent with a
            // customer attaches the card regardless, and the sheet copy
            // already says the card is kept. Cards saved through
            // `createStaked` are marked redisplayable, so they show up here.
            payment_method_save: 'disabled',
            payment_method_redisplay: 'enabled',
            payment_method_remove: 'enabled',
          },
        },
      },
    });

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
      // Checked again in `createStaked`, so the client cannot swap the amount
      // after the card was saved.
      metadata: { userId: ctx.user._id, amountCents: String(args.amountCents) },
    });
    if (setupIntent.client_secret === null) {
      throw new Error('Stripe returned a SetupIntent without a client secret');
    }

    return {
      customerId,
      customerSessionClientSecret: session.client_secret,
      setupIntentClientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    };
  },
});

/**
 * Step two: the PaymentSheet reported success, but only Stripe's copy of the
 * SetupIntent is trusted. Everything the client claims is checked against it.
 */
export const createStaked = authedAction({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    dueAt: v.number(),
    amountCents: v.number(),
    setupIntentId: v.string(),
  },
  returns: v.id('goals'),
  handler: async (ctx, args): Promise<Id<'goals'>> => {
    requireLead(args.dueAt);
    requireCommitmentText(args.title, args.description);
    requireStakeAmount(args.amountCents);

    const customerId = ctx.user.stripeCustomerId;
    if (customerId === undefined) {
      throw new Error('No card on file: start the stake again');
    }

    const stripe = stripeClient();
    const setupIntent = await stripe.setupIntents.retrieve(args.setupIntentId);
    if (setupIntent.status !== 'succeeded') {
      throw new Error('The card was not saved');
    }
    if (setupIntent.customer !== customerId) {
      throw new Error('This card belongs to another customer');
    }
    if (
      setupIntent.metadata?.userId !== ctx.user._id ||
      setupIntent.metadata.amountCents !== String(args.amountCents)
    ) {
      throw new Error('The stake does not match what the card was saved for');
    }
    if (typeof setupIntent.payment_method !== 'string') {
      throw new Error('The saved card is missing its payment method');
    }

    // Without the save checkbox the card lands as `limited`, which the sheet
    // would not offer again; the user has agreed to keep it, so it is safe to
    // show next time. Best effort: a goal is worth more than a redisplay.
    try {
      await stripe.paymentMethods.update(setupIntent.payment_method, {
        allow_redisplay: 'always',
      });
    } catch (error: unknown) {
      console.error('Could not mark the card as redisplayable', error);
    }

    const goalId: Id<'goals'> = await ctx.runMutation(internal.goals.insertStaked, {
      userId: ctx.user._id,
      title: args.title,
      description: args.description,
      dueAt: args.dueAt,
      amountCents: args.amountCents,
      stripeCustomerId: customerId,
      stripePaymentMethodId: setupIntent.payment_method,
      stripeSetupIntentId: setupIntent.id,
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
    amountCents: v.number(),
    stripeCustomerId: v.string(),
    stripePaymentMethodId: v.string(),
    stripeSetupIntentId: v.string(),
  },
  returns: v.id('goals'),
  handler: async (ctx, args): Promise<Id<'goals'>> => {
    requireLead(args.dueAt);

    const replay = await ctx.db
      .query('goals')
      .withIndex('by_setup_intent', (q) =>
        q.eq('stake.stripeSetupIntentId', args.stripeSetupIntentId),
      )
      .first();
    if (replay !== null) {
      throw new Error('This card confirmation was already used for a goal');
    }

    const goalId = await ctx.db.insert('goals', {
      userId: args.userId,
      title: args.title,
      description: args.description,
      dueAt: args.dueAt,
      order: await nextOrder(ctx, args.userId),
      stake: {
        amountCents: args.amountCents,
        stripeCustomerId: args.stripeCustomerId,
        stripePaymentMethodId: args.stripePaymentMethodId,
        stripeSetupIntentId: args.stripeSetupIntentId,
        status: 'armed',
      },
    });

    const settleJobId = await ctx.scheduler.runAt(args.dueAt, internal.stripe.settle, {
      goalId,
      attempt: 0,
    });
    const goal = await ctx.db.get('goals', goalId);
    if (goal?.stake !== undefined) {
      await ctx.db.patch('goals', goalId, { stake: { ...goal.stake, settleJobId } });
    }

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
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const goal = await requireOwnedGoal(ctx, args.goalId);
    requireCommitmentText(args.title ?? goal.title, args.description);

    const fields: Partial<Doc<'goals'>> = {};
    if (args.title !== undefined) fields.title = args.title;
    if (args.description !== undefined) {
      fields.description = args.description ?? undefined;
    }
    if (args.dueAt !== undefined && args.dueAt !== goal.dueAt) {
      if (goal.stake !== undefined) {
        throw new Error('The deadline is locked once money is on the goal');
      }
      if (goal.completedAt !== undefined) {
        throw new Error('The goal is already done');
      }
      requireLead(args.dueAt);
      fields.dueAt = args.dueAt;
    }

    if (Object.keys(fields).length > 0) {
      await ctx.db.patch('goals', args.goalId, fields);
    }

    return null;
  },
});

/** Deleting an armed goal simply calls the bet off: nothing is charged. */
export const remove = authedMutation({
  args: { goalId: v.id('goals') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const goal = await requireOwnedGoal(ctx, args.goalId);

    if (goal.stake !== undefined) {
      await cancelSettlement(ctx, goal.stake);
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
