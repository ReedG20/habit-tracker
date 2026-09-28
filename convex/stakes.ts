import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { authedAction, authedMutation } from './lib/customFunctions';
import { PRO_REQUIRED, requirePro } from './lib/entitlements';
import { localDay, requireDevOverrides } from './lib/lockout';
import {
  isValidStakeAmount,
  MONEY_CAP_CENTS,
  STAKE_AMOUNT_ERROR,
  stakeView,
  stakeViewValidator,
  type StakeView,
} from './lib/stakeRules';
import {
  cancelJob,
  hasOpenDecline,
  loseStake,
  materializeGoalStake,
  requireMoneyHeadroom,
  usedMoneyCents,
  type Run,
} from './lib/stakes';
import { runValidator } from './lib/stakeSchema';
import { stripeClient } from './lib/stripe';

/**
 * Stakes: what each commitment has on the line (`lib/stakeSchema.ts`). This
 * module arms them, resolves goal stakes at the deadline, and serves the loss
 * screen. Habit stakes come due in the habit check (`habitChecks.ts`); money is
 * charged by `stripe.chargeStake`; friends are emailed by `emails.ts`.
 */

/** How long to wait for a submission that was still being verified at the deadline. */
const PENDING_GRACE_MS = 3 * 60 * 1000;
const MAX_PENDING_WAITS = 3;

type AuthedCtx<T> = T & { user: Doc<'users'> };

// ---------------------------------------------------------------------------
// Arming

export type ArmSpec =
  | {
      kind: 'money';
      amountCents: number;
      stripeCustomerId: string;
      stripePaymentMethodId: string;
      stripeSetupIntentId?: string;
      cardBrand?: string;
      cardLast4?: string;
    }
  | { kind: 'friend'; friend: Doc<'friends'> }
  | { kind: 'lockout'; days: 1 | 3 | 7 };

/**
 * Puts a new stake on a goal or habit and points it there. Money is checked
 * against the cap here, inside the transaction that arms it, so two stakes
 * started at once can't both slip under it. A goal's stake is resolved by a
 * job at its deadline; a friend hears about it straight away.
 */
export async function armStake(
  ctx: MutationCtx,
  target: { goal: Doc<'goals'> } | { habit: Doc<'habits'> },
  spec: ArmSpec,
): Promise<Id<'stakes'>> {
  const subject = 'goal' in target ? target.goal : target.habit;
  const common = {
    userId: subject.userId,
    goalId: 'goal' in target ? target.goal._id : undefined,
    habitId: 'habit' in target ? target.habit._id : undefined,
    title: subject.title,
    createdAt: Date.now(),
  };

  let stakeId: Id<'stakes'>;
  switch (spec.kind) {
    case 'money': {
      if (!isValidStakeAmount(spec.amountCents)) throw new Error(STAKE_AMOUNT_ERROR);
      await requireMoneyHeadroom(ctx, subject.userId, spec.amountCents);
      if (spec.stripeSetupIntentId !== undefined) {
        await requireFreshSetupIntent(ctx, spec.stripeSetupIntentId);
      }
      const { kind: _kind, ...card } = spec;
      stakeId = await ctx.db.insert('stakes', {
        kind: 'money',
        ...common,
        status: 'armed',
        ...card,
      });
      break;
    }
    case 'friend':
      stakeId = await ctx.db.insert('stakes', {
        kind: 'friend',
        ...common,
        status: 'armed',
        friendId: spec.friend._id,
        friendName: spec.friend.name,
        friendEmail: spec.friend.email,
      });
      await ctx.scheduler.runAfter(0, internal.emails.sendHeadsUp, { stakeId });
      break;
    case 'lockout':
      if ('goal' in target) throw new Error('A lockout only goes on a habit');
      stakeId = await ctx.db.insert('stakes', {
        kind: 'lockout',
        ...common,
        status: 'armed',
        days: spec.days,
      });
      break;
  }

  if ('goal' in target) {
    const resolveJobId = await ctx.scheduler.runAt(target.goal.dueAt, internal.stakes.resolveGoal, {
      stakeId,
      attempt: 0,
    });
    await ctx.db.patch('stakes', stakeId, { resolveJobId });
    await ctx.db.patch('goals', target.goal._id, { stakeId });
  } else {
    await ctx.db.patch('habits', target.habit._id, { stakeId });
  }

  return stakeId;
}

/** A SetupIntent may back at most one stake, old embedded goal stakes included. */
async function requireFreshSetupIntent(ctx: MutationCtx, setupIntentId: string): Promise<void> {
  const row = await ctx.db
    .query('stakes')
    .withIndex('by_setup_intent', (q) => q.eq('stripeSetupIntentId', setupIntentId))
    .first();
  const legacy = await ctx.db
    .query('goals')
    .withIndex('by_setup_intent', (q) => q.eq('stake.stripeSetupIntentId', setupIntentId))
    .first();
  if (row !== null || legacy !== null) {
    throw new Error('This card confirmation was already used');
  }
}

// ---------------------------------------------------------------------------
// Saving a card (actions)

export type CardSetup = {
  customerId: string;
  customerSessionClientSecret: string;
  setupIntentClientSecret: string;
  setupIntentId: string;
};

export const cardSetupValidator = v.object({
  customerId: v.string(),
  customerSessionClientSecret: v.string(),
  setupIntentClientSecret: v.string(),
  setupIntentId: v.string(),
});

/** Everything the PaymentSheet needs to show the user's saved cards. */
async function customerSession(
  ctx: AuthedCtx<ActionCtx>,
): Promise<{ customerId: string; clientSecret: string }> {
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
          // customer attaches the card regardless, and the sheet copy already
          // says the card is kept. Cards saved through `verifySavedCard` are
          // marked redisplayable, so they show up here.
          payment_method_save: 'disabled',
          payment_method_redisplay: 'enabled',
          payment_method_remove: 'enabled',
        },
      },
    },
  });

  return { customerId, clientSecret: session.client_secret };
}

/**
 * Step one of putting money on anything: mints what the PaymentSheet needs to
 * save a card for off-session use. Nothing is stored yet.
 */
export async function mintCardSetup(
  ctx: AuthedCtx<ActionCtx>,
  amountCents: number,
): Promise<CardSetup> {
  if (!isValidStakeAmount(amountCents)) throw new Error(STAKE_AMOUNT_ERROR);
  // Checked again when the stake is armed; this only saves a Stripe round trip.
  const problem: string | null = await ctx.runQuery(internal.stakes.moneyProblem, {
    userId: ctx.user._id,
    amountCents,
    now: Date.now(),
  });
  if (problem !== null) throw new Error(problem);

  const session = await customerSession(ctx);
  const setupIntent = await stripeClient().setupIntents.create({
    customer: session.customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
    // Checked again in `verifySavedCard`, so the client cannot swap the
    // amount after the card was saved.
    metadata: { userId: ctx.user._id, amountCents: String(amountCents) },
  });
  if (setupIntent.client_secret === null) {
    throw new Error('Stripe returned a SetupIntent without a client secret');
  }

  return {
    customerId: session.customerId,
    customerSessionClientSecret: session.clientSecret,
    setupIntentClientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
  };
}

export type SavedCard = Extract<ArmSpec, { kind: 'money' }>;

/**
 * Step two: the PaymentSheet reported success, but only Stripe's copy of the
 * SetupIntent is trusted. Everything the client claims is checked against it.
 */
export async function verifySavedCard(
  ctx: AuthedCtx<ActionCtx>,
  setupIntentId: string,
  amountCents: number,
): Promise<SavedCard> {
  if (!isValidStakeAmount(amountCents)) throw new Error(STAKE_AMOUNT_ERROR);
  const customerId = ctx.user.stripeCustomerId;
  if (customerId === undefined) {
    throw new Error('No card on file: start the stake again');
  }

  const stripe = stripeClient();
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ['payment_method'],
  });
  if (setupIntent.status !== 'succeeded') {
    throw new Error('The card was not saved');
  }
  if (setupIntent.customer !== customerId) {
    throw new Error('This card belongs to another customer');
  }
  if (
    setupIntent.metadata?.userId !== ctx.user._id ||
    setupIntent.metadata.amountCents !== String(amountCents)
  ) {
    throw new Error('The stake does not match what the card was saved for');
  }
  const method = setupIntent.payment_method;
  if (method === null || typeof method === 'string') {
    throw new Error('The saved card is missing its payment method');
  }

  // Without the save checkbox the card lands as `limited`, which the sheet
  // would not offer again; the user has agreed to keep it, so it is safe to
  // show next time. Best effort: a stake is worth more than a redisplay.
  try {
    await stripe.paymentMethods.update(method.id, { allow_redisplay: 'always' });
  } catch (error: unknown) {
    console.error('Could not mark the card as redisplayable', error);
  }

  return {
    kind: 'money',
    amountCents,
    stripeCustomerId: customerId,
    stripePaymentMethodId: method.id,
    stripeSetupIntentId: setupIntent.id,
    cardBrand: method.card?.brand,
    cardLast4: method.card?.last4,
  };
}

/**
 * The card an earlier stake of the user's was on, for "go again at the same
 * amount" without saving it again. The payment method comes from our row,
 * never the client, and must still be attached to the user's customer.
 */
export async function reuseCard(
  ctx: AuthedCtx<ActionCtx>,
  fromStakeId: Id<'stakes'>,
  amountCents: number,
): Promise<SavedCard> {
  if (!isValidStakeAmount(amountCents)) throw new Error(STAKE_AMOUNT_ERROR);
  const card: {
    stripeCustomerId: string;
    stripePaymentMethodId: string;
    cardBrand?: string;
    cardLast4?: string;
  } | null = await ctx.runQuery(internal.stakes.cardOf, {
    userId: ctx.user._id,
    stakeId: fromStakeId,
  });
  if (card === null) throw new Error('That card can’t be reused: add it again');

  const method = await stripeClient().paymentMethods.retrieve(card.stripePaymentMethodId);
  const attachedTo = typeof method.customer === 'string' ? method.customer : method.customer?.id;
  if (attachedTo !== card.stripeCustomerId) {
    throw new Error('That card was removed: add it again');
  }

  return { kind: 'money', amountCents, ...card };
}

export const cardOf = internalQuery({
  args: { userId: v.id('users'), stakeId: v.id('stakes') },
  returns: v.union(
    v.object({
      stripeCustomerId: v.string(),
      stripePaymentMethodId: v.string(),
      cardBrand: v.optional(v.string()),
      cardLast4: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake === null || stake.userId !== args.userId || stake.kind !== 'money') return null;
    return {
      stripeCustomerId: stake.stripeCustomerId,
      stripePaymentMethodId: stake.stripePaymentMethodId,
      cardBrand: stake.cardBrand,
      cardLast4: stake.cardLast4,
    };
  },
});

/** Why a new money stake can't go ahead, or `null`. For actions, which can't read tables. */
export const moneyProblem = internalQuery({
  args: { userId: v.id('users'), amountCents: v.number(), now: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    try {
      await requirePro(ctx, args.userId);
      await requireMoneyHeadroom(ctx, args.userId, args.amountCents);
      return null;
    } catch (error: unknown) {
      return error instanceof Error ? error.message : PRO_REQUIRED;
    }
  },
});

export const beginMoney = authedAction({
  args: { amountCents: v.number() },
  returns: cardSetupValidator,
  handler: async (ctx, args): Promise<CardSetup> => await mintCardSetup(ctx, args.amountCents),
});

// ---------------------------------------------------------------------------
// Goal deadlines

/**
 * Runs at a staked goal's deadline. Proven in time: the stake is let go.
 * Proof still being checked: waits a few minutes for the verdict, so a photo
 * sent at the last second is judged before anything happens. Otherwise the
 * stake comes due: money is charged, a friend is told.
 */
export const resolveGoal = internalMutation({
  args: { stakeId: v.id('stakes'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake === null) return null;
    await resolveGoalStake(ctx, stake, args.attempt);
    return null;
  },
});

/** The same, for jobs scheduled before stakes had their own rows (`stripe.settle`). */
export const resolveLegacyGoal = internalMutation({
  args: { goalId: v.id('goals'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const goal = await ctx.db.get('goals', args.goalId);
    if (goal === null) return null;
    const stake = await materializeGoalStake(ctx, goal);
    if (stake !== null) await resolveGoalStake(ctx, stake, args.attempt);
    return null;
  },
});

async function resolveGoalStake(
  ctx: MutationCtx,
  stake: Doc<'stakes'>,
  attempt: number,
): Promise<void> {
  if (stake.goalId === undefined) return;

  // Claimed by an earlier run whose charge never finished (a legacy retry).
  if (stake.kind === 'money' && stake.status === 'charging') {
    await ctx.scheduler.runAfter(0, internal.stripe.chargeStake, { stakeId: stake._id, attempt });
    return;
  }
  if (stake.status !== 'armed') return;

  const goal = await ctx.db.get('goals', stake.goalId);
  if (goal === null) return;
  if (goal.completedAt !== undefined) {
    await ctx.db.patch('stakes', stake._id, {
      status: 'released',
      releasedAt: goal.completedAt,
      resolveJobId: undefined,
    });
    return;
  }

  const latest = await ctx.db
    .query('goalSubmissions')
    .withIndex('by_goal', (q) => q.eq('goalId', goal._id))
    .order('desc')
    .first();
  if (latest?.status === 'pending' && attempt < MAX_PENDING_WAITS) {
    const resolveJobId = await ctx.scheduler.runAfter(
      PENDING_GRACE_MS,
      internal.stakes.resolveGoal,
      { stakeId: stake._id, attempt: attempt + 1 },
    );
    await ctx.db.patch('stakes', stake._id, { resolveJobId });
    return;
  }

  await loseStake(ctx, stake, Date.now());
}

// ---------------------------------------------------------------------------
// What the app reads

export const headroomValidator = v.object({
  capCents: v.number(),
  usedCents: v.number(),
  remainingCents: v.number(),
  /** A declined card hasn't been settled up, so no new money can go down. */
  blockedByDecline: v.boolean(),
});

/** How much more money can go on the line right now. */
export const headroom = query({
  args: {},
  returns: headroomValidator,
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    const usedCents = user === null ? 0 : await usedMoneyCents(ctx, user._id);
    return {
      capCents: MONEY_CAP_CENTS,
      usedCents,
      remainingCents: Math.max(0, MONEY_CAP_CENTS - usedCents),
      blockedByDecline: user === null ? false : await hasOpenDecline(ctx, user._id),
    };
  },
});

/** Everything the loss screen shows about one stake that came due. */
export const lossValidator = v.object({
  stake: stakeViewValidator,
  title: v.string(),
  goalId: v.optional(v.id('goals')),
  habitId: v.optional(v.id('habits')),
  /** The habit's still there to restart (it may have been deleted since). */
  habitExists: v.boolean(),
  /** Goals: what the proof had to show and when it was due, for "set it again". */
  goalDescription: v.optional(v.string()),
  dueAt: v.optional(v.number()),
  /** Habits: how often it was due, for the copy. */
  timesPerWeek: v.optional(v.number()),
  run: v.optional(runValidator),
  /** Lockouts: the last frozen day, and when the freeze lifts. */
  frozenThrough: v.optional(v.string()),
  frozenUntil: v.optional(v.number()),
  lostAt: v.number(),
  seen: v.boolean(),
});

export type Loss = typeof lossValidator.type;

async function lossOf(ctx: QueryCtx, stake: Doc<'stakes'>): Promise<Loss | null> {
  if (stake.lostAt === undefined) return null;

  const [goal, habit, freeze] = await Promise.all([
    stake.goalId === undefined ? null : ctx.db.get('goals', stake.goalId),
    stake.habitId === undefined ? null : ctx.db.get('habits', stake.habitId),
    stake.kind === 'lockout' && stake.freezeId !== undefined
      ? ctx.db.get('freezes', stake.freezeId)
      : null,
  ]);

  return {
    stake: stakeView(stake),
    title: stake.title,
    goalId: stake.goalId,
    habitId: stake.habitId,
    habitExists: habit !== null && habit.endsAfter === undefined,
    goalDescription: goal?.description,
    dueAt: goal?.dueAt,
    timesPerWeek: habit?.timesPerWeek,
    run: stake.run,
    frozenThrough: freeze?.endDay,
    frozenUntil: freeze?.endsAt,
    lostAt: stake.lostAt,
    seen: stake.seenAt !== undefined,
  };
}

/**
 * The newest loss the user hasn't seen, which the app opens full screen. A
 * charge still in flight waits until it lands, so the screen never says
 * "charged" before it is. Tolerates a missing user row, like `habits.list`.
 */
export const unseenLoss = query({
  args: {},
  returns: v.union(lossValidator, v.null()),
  handler: async (ctx): Promise<Loss | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;

    const unseen = await ctx.db
      .query('stakes')
      .withIndex('by_user_and_seen_and_lost', (q) =>
        q.eq('userId', user._id).eq('seenAt', undefined).gt('lostAt', 0),
      )
      .order('desc')
      .take(10);
    const ready = unseen.find((stake) => !(stake.kind === 'money' && stake.status === 'charging'));
    return ready === undefined ? null : await lossOf(ctx, ready);
  },
});

/** One loss by id, for the screen itself and for pushes that link to it. */
export const loss = query({
  args: { stakeId: v.id('stakes') },
  returns: v.union(lossValidator, v.null()),
  handler: async (ctx, args): Promise<Loss | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake === null || stake.userId !== user._id) return null;
    return await lossOf(ctx, stake);
  },
});

export const markSeen = authedMutation({
  args: { stakeId: v.id('stakes') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake === null || stake.userId !== ctx.user._id) {
      throw new Error('Stake not found');
    }
    if (stake.seenAt === undefined && stake.lostAt !== undefined) {
      await ctx.db.patch('stakes', stake._id, { seenAt: Date.now() });
    }
    return null;
  },
});

export const totalsValidator = v.object({
  onTheLineCents: v.number(),
  keptCents: v.number(),
  lostCents: v.number(),
});

/** Money totals for Me: armed now, kept by finishing, and lost to misses. */
export async function moneyTotals(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<{ onTheLineCents: number; keptCents: number; lostCents: number }> {
  const totals = { onTheLineCents: 0, keptCents: 0, lostCents: 0 };
  const add = (status: string, cents: number) => {
    if (status === 'armed') totals.onTheLineCents += cents;
    else if (status === 'released') totals.keptCents += cents;
    else if (status === 'charged' || status === 'disputed') totals.lostCents += cents;
  };

  for (const status of ['armed', 'released', 'charged', 'disputed'] as const) {
    const rows = await ctx.db
      .query('stakes')
      .withIndex('by_user_and_status', (q) => q.eq('userId', userId).eq('status', status))
      .take(1000);
    for (const stake of rows) {
      if (stake.kind === 'money') add(stake.status, stake.amountCents);
    }
  }

  // Goal money that hasn't moved to its own row yet.
  const goals = await ctx.db
    .query('goals')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(1000);
  for (const goal of goals) {
    if (goal.stakeId === undefined && goal.stake !== undefined) {
      add(goal.stake.status, goal.stake.amountCents);
    }
  }

  return totals;
}

export const totals = query({
  args: {},
  returns: totalsValidator,
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return { onTheLineCents: 0, keptCents: 0, lostCents: 0 };
    return await moneyTotals(ctx, user._id);
  },
});

// ---------------------------------------------------------------------------
// Settling up a declined card

export const settleUpValidator = v.object({
  customerId: v.string(),
  customerSessionClientSecret: v.string(),
  paymentIntentClientSecret: v.string(),
  amountCents: v.number(),
});

/**
 * A declined stake is still owed. This starts an on-session payment for it
 * (the user is right there, so a card that needs authentication can do it),
 * and `confirmSettleUp` or the webhook records it once it goes through.
 */
export const settleUp = authedAction({
  args: { stakeId: v.id('stakes') },
  returns: settleUpValidator,
  handler: async (ctx, args): Promise<typeof settleUpValidator.type> => {
    const owed: {
      amountCents: number;
      title: string;
      paymentMethodId: string;
    } | null = await ctx.runQuery(internal.stakes.owedStake, {
      userId: ctx.user._id,
      stakeId: args.stakeId,
    });
    if (owed === null) throw new Error('Nothing is owed on this stake');

    const session = await customerSession(ctx);
    // A fresh intent each time: the last one may have been abandoned mid-sheet.
    const intent = await stripeClient().paymentIntents.create({
      amount: owed.amountCents,
      currency: 'usd',
      customer: session.customerId,
      // Offered first, but the sheet lets them pick another card.
      payment_method: owed.paymentMethodId,
      payment_method_types: ['card'],
      description: `Ante stake: ${owed.title}`.slice(0, 200),
      metadata: { stakeId: args.stakeId, settleUp: '1' },
    });
    if (intent.client_secret === null) {
      throw new Error('Stripe returned a PaymentIntent without a client secret');
    }
    await ctx.runMutation(internal.stripe.recordSettleUpIntent, {
      stakeId: args.stakeId,
      paymentIntentId: intent.id,
    });

    return {
      customerId: session.customerId,
      customerSessionClientSecret: session.clientSecret,
      paymentIntentClientSecret: intent.client_secret,
      amountCents: owed.amountCents,
    };
  },
});

export const owedStake = internalQuery({
  args: { userId: v.id('users'), stakeId: v.id('stakes') },
  returns: v.union(
    v.object({ amountCents: v.number(), title: v.string(), paymentMethodId: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (
      stake === null ||
      stake.userId !== args.userId ||
      stake.kind !== 'money' ||
      stake.status !== 'charge_failed' ||
      stake.failureKind !== 'declined'
    ) {
      return null;
    }
    return {
      amountCents: stake.amountCents,
      title: stake.title,
      paymentMethodId: stake.stripePaymentMethodId,
    };
  },
});

/** Called once the PaymentSheet reports success; only Stripe's copy is trusted. */
export const confirmSettleUp = authedAction({
  args: { stakeId: v.id('stakes') },
  returns: v.object({ settled: v.boolean() }),
  handler: async (ctx, args): Promise<{ settled: boolean }> => {
    const paymentIntentId: string | null = await ctx.runQuery(internal.stakes.settleUpIntent, {
      userId: ctx.user._id,
      stakeId: args.stakeId,
    });
    if (paymentIntentId === null) return { settled: false };

    const intent = await stripeClient().paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') return { settled: false };
    await ctx.runMutation(internal.stripe.recordCharge, {
      stakeId: args.stakeId,
      paymentIntentId,
    });
    return { settled: true };
  },
});

export const settleUpIntent = internalQuery({
  args: { userId: v.id('users'), stakeId: v.id('stakes') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake === null || stake.userId !== args.userId || stake.kind !== 'money') return null;
    return stake.settleUpPaymentIntentId ?? null;
  },
});

// ---------------------------------------------------------------------------
// Developer tools

/**
 * Developer tool: a made-up loss of each kind, to preview the loss screen.
 * Nothing is charged or emailed. Dev and preview deployments only.
 */
export const devLose = authedMutation({
  args: {
    kind: v.union(v.literal('money'), v.literal('friend'), v.literal('lockout')),
    subject: v.union(v.literal('habit'), v.literal('goal')),
    declined: v.optional(v.boolean()),
    streak: v.optional(v.number()),
  },
  returns: v.id('stakes'),
  handler: async (ctx, args): Promise<Id<'stakes'>> => {
    requireDevOverrides();
    const now = Date.now();
    const today = localDay(now, ctx.user.timeZone ?? 'UTC');

    const habit =
      args.subject === 'habit'
        ? await ctx.db
            .query('habits')
            .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
            .first()
        : null;
    const goal =
      args.subject === 'goal'
        ? await ctx.db
            .query('goals')
            .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
            .first()
        : null;
    const streak = args.streak ?? 23;
    const run: Run | undefined =
      args.subject === 'habit'
        ? { streak, unit: 'day', completions: streak, sinceDay: today, missedPeriod: today }
        : undefined;
    const common = {
      userId: ctx.user._id,
      habitId: habit?._id,
      goalId: goal?._id,
      title: habit?.title ?? goal?.title ?? 'Meditate for ten minutes',
      createdAt: now,
      lostAt: now,
      run,
    };

    switch (args.kind) {
      case 'money':
        return await ctx.db.insert('stakes', {
          kind: 'money',
          ...common,
          status: args.declined === true ? 'charge_failed' : 'charged',
          failureKind: args.declined === true ? 'declined' : undefined,
          failureReason: args.declined === true ? 'insufficient_funds' : undefined,
          amountCents: 2500,
          stripeCustomerId: 'cus_dev',
          stripePaymentMethodId: 'pm_dev',
          cardBrand: 'visa',
          cardLast4: '4242',
          chargedAt: args.declined === true ? undefined : now,
        });
      case 'friend': {
        const friendId = await ctx.db.insert('friends', {
          userId: ctx.user._id,
          name: 'Sam',
          email: 'sam@example.com',
          // Opted out, so nothing real is ever sent to it.
          status: 'opted_out',
          optOutToken: `dev-${now}`,
          createdAt: now,
        });
        return await ctx.db.insert('stakes', {
          kind: 'friend',
          ...common,
          status: 'told',
          friendId,
          friendName: 'Sam',
          friendEmail: 'sam@example.com',
          toldAt: now,
        });
      }
      case 'lockout':
        return await ctx.db.insert('stakes', {
          kind: 'lockout',
          ...common,
          status: 'triggered',
          days: 3,
        });
    }
  },
});

/** Cancels the deadline job of a stake that's being dropped with its goal. */
export async function dropGoalStake(ctx: MutationCtx, stake: Doc<'stakes'>): Promise<void> {
  await cancelJob(ctx, stake.resolveJobId);
  if (stake.status === 'armed') {
    await ctx.db.patch('stakes', stake._id, {
      status: stake.kind === 'friend' ? 'void' : 'released',
      releasedAt: Date.now(),
      resolveJobId: undefined,
    });
  }
}

export type { StakeView };
