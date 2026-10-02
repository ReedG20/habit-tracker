import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { friendInputValidator, resolveFriend } from './friends';
import { MIN_LEAD_MS } from './goals';
import { getCurrentUserOrNull } from './lib/auth';
import { authedAction, authedMutation } from './lib/customFunctions';
import { requirePro } from './lib/entitlements';
import { touchReminders } from './lib/notify';
import { proofMethodValidator } from './lib/proofMethods';
import { raiseProblem, type LadderChoice } from './lib/stakeLadder';
import { stakeView, stakeViewValidator } from './lib/stakeRules';
import { cancelJob, materializeGoalStake, releaseStake, requireMoneyHeadroom } from './lib/stakes';
import { lockoutDaysValidator, moneyFields } from './lib/stakeSchema';
import { armStake, verifySavedCard, type ArmSpec } from './stakes';

/**
 * Upping the ante: raising what's on the line for a goal or habit that's
 * already running, along the ladder in `lib/stakeLadder.ts`. Only ever up, so
 * a raise can't be a way out of a stake. More of the same stake changes the
 * row in place; a new kind lets the old one go and arms a fresh row.
 */

const targetValidator = v.union(
  v.object({ goalId: v.id('goals') }),
  v.object({ habitId: v.id('habits') }),
);

type Target = typeof targetValidator.type;

type Subject = { goal: Doc<'goals'> } | { habit: Doc<'habits'> };

type Raisable = {
  subject: Subject;
  commitment: 'goal' | 'habit';
  /** The stake on it now; null for none. A friend who opted out is here, and holds nothing. */
  current: Doc<'stakes'> | null;
};

const STAKE_CAME_DUE = 'Its stake already came due';

/** Why the commitment can't be raised right now, short of the clock and Pro. */
function habitBlock(habit: Doc<'habits'>): string | null {
  if (habit.brokenAt !== undefined) return 'Its streak broke: restart it with new stakes instead';
  if (habit.endsAfter !== undefined) return 'This habit is ending';
  return null;
}

function goalBlock(goal: Doc<'goals'>): string | null {
  if (goal.completedAt !== undefined) return 'This goal is already done';
  // Its deadline was moved once already; the stakes hold where they are.
  if (goal.originalDueAt !== undefined) return 'The stakes are set while your deadline is extended';
  return null;
}

/** A stake that's still riding, or one that holds nothing: anything else already came due. */
function stakeBlock(stake: Pick<Doc<'stakes'>, 'kind' | 'status'> | null): string | null {
  if (stake === null || stake.status === 'armed') return null;
  return stake.kind === 'friend' && stake.status === 'void' ? null : STAKE_CAME_DUE;
}

async function requireRaisable(
  ctx: MutationCtx,
  user: Doc<'users'>,
  target: Target,
): Promise<Raisable> {
  if ('habitId' in target) {
    const habit = await ctx.db.get('habits', target.habitId);
    if (habit === null || habit.userId !== user._id) throw new Error('Habit not found');
    await requirePro(ctx, user._id);
    const block = habitBlock(habit);
    if (block !== null) throw new ConvexError(block);
    const current = habit.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
    const stuck = stakeBlock(current);
    if (stuck !== null) throw new ConvexError(stuck);
    return { subject: { habit }, commitment: 'habit', current };
  }

  const goal = await ctx.db.get('goals', target.goalId);
  if (goal === null || goal.userId !== user._id) throw new Error('Goal not found');
  await requirePro(ctx, user._id);
  const block = goalBlock(goal);
  if (block !== null) throw new ConvexError(block);
  if (goal.dueAt < Date.now() + MIN_LEAD_MS) {
    throw new ConvexError('It’s too close to the deadline to change the stakes');
  }
  const current = await materializeGoalStake(ctx, goal);
  const stuck = stakeBlock(current);
  if (stuck !== null) throw new ConvexError(stuck);
  // The goal may have just had its stake moved into a row; read it fresh for `armStake`.
  const fresh = await ctx.db.get('goals', goal._id);
  if (fresh === null) throw new Error('Goal not found');
  return { subject: { goal: fresh }, commitment: 'goal', current };
}

function requireHigher(raisable: Raisable, next: LadderChoice): void {
  const current = raisable.current === null ? null : stakeView(raisable.current);
  const problem = raiseProblem(current, next, raisable.commitment);
  if (problem !== null) throw new ConvexError(problem);
}

/** Lets the old stake go before a new kind takes its place. A friend isn't emailed about it. */
async function retire(ctx: MutationCtx, stake: Doc<'stakes'> | null): Promise<void> {
  if (stake === null) return;
  if (stake.status === 'armed') {
    await releaseStake(ctx, stake);
  } else {
    // A friend who opted out: its deadline job has nothing left to do.
    await cancelJob(ctx, stake.resolveJobId);
  }
}

// ---------------------------------------------------------------------------
// Raising

const plainRaiseValidator = v.union(
  v.object({ kind: v.literal('lockout'), days: lockoutDaysValidator }),
  v.object({ kind: v.literal('friend'), friend: friendInputValidator }),
  /** Only more money on a stake that's already money; switching to money needs a card (`raiseWithCard`). */
  v.object({ kind: v.literal('money'), amountCents: v.number() }),
);

export const raise = authedMutation({
  args: { target: targetValidator, stake: plainRaiseValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const raisable = await requireRaisable(ctx, ctx.user, args.target);
    const next = args.stake;
    requireHigher(raisable, next.kind === 'friend' ? { kind: 'friend' } : next);
    const { current } = raisable;

    // More of the same: the row stays, so its history and charge key do too.
    if (current !== null && current.status === 'armed' && current.kind === next.kind) {
      if (current.kind === 'money' && next.kind === 'money') {
        await requireMoneyHeadroom(ctx, ctx.user._id, next.amountCents - current.amountCents);
        await ctx.db.patch('stakes', current._id, { amountCents: next.amountCents });
      } else if (current.kind === 'lockout' && next.kind === 'lockout') {
        await ctx.db.patch('stakes', current._id, { days: next.days });
      }
      await touchReminders(ctx, ctx.user._id);
      return null;
    }

    let spec: ArmSpec;
    switch (next.kind) {
      case 'money':
        throw new ConvexError('Add a card for the stake');
      case 'lockout':
        spec = { kind: 'lockout', days: next.days };
        break;
      case 'friend':
        spec = { kind: 'friend', friend: await resolveFriend(ctx, ctx.user, next.friend) };
        break;
    }
    await retire(ctx, current);
    await armStake(ctx, raisable.subject, spec);
    await touchReminders(ctx, ctx.user._id);
    return null;
  },
});

/** Switches to money, once the PaymentSheet saved the card (`stakes.beginMoney`). */
export const raiseWithCard = authedAction({
  args: { target: targetValidator, amountCents: v.number(), setupIntentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { kind: _kind, ...card } = await verifySavedCard(
      ctx,
      args.setupIntentId,
      args.amountCents,
    );
    await ctx.runMutation(internal.raises.armMoney, {
      userId: ctx.user._id,
      target: args.target,
      ...card,
    });
    return null;
  },
});

export const armMoney = internalMutation({
  args: {
    userId: v.id('users'),
    target: targetValidator,
    amountCents: moneyFields.amountCents,
    stripeCustomerId: moneyFields.stripeCustomerId,
    stripePaymentMethodId: moneyFields.stripePaymentMethodId,
    stripeSetupIntentId: moneyFields.stripeSetupIntentId,
    cardBrand: moneyFields.cardBrand,
    cardLast4: moneyFields.cardLast4,
    cardFingerprint: moneyFields.cardFingerprint,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const user = await ctx.db.get('users', args.userId);
    if (user === null) throw new Error('User not found');
    const { userId: _userId, target, ...card } = args;

    const raisable = await requireRaisable(ctx, user, target);
    requireHigher(raisable, { kind: 'money', amountCents: card.amountCents });
    if (raisable.current?.kind === 'money') {
      throw new ConvexError('This already has money on it: raise the amount instead');
    }

    await retire(ctx, raisable.current);
    // Checks the cap; throwing rolls the release back with it.
    await armStake(ctx, raisable.subject, { kind: 'money', ...card });
    await touchReminders(ctx, user._id);
    return null;
  },
});

// ---------------------------------------------------------------------------
// What the app reads

const raiseTargetValidator = v.object({
  commitment: v.union(v.literal('goal'), v.literal('habit')),
  title: v.string(),
  description: v.optional(v.string()),
  timesPerWeek: v.optional(v.number()),
  proofMethod: v.optional(proofMethodValidator),
  timerMinutes: v.optional(v.number()),
  /** Goals only. The app checks it against the clock. */
  dueAt: v.optional(v.number()),
  stake: v.union(stakeViewValidator, v.null()),
  /** Why it can't be raised, clock aside; null when it can. */
  blocked: v.union(v.string(), v.null()),
});

type RaiseTarget = typeof raiseTargetValidator.type;

/**
 * Money still embedded on the goal (from before stakes had their own table)
 * moves to a row on the first write; a query can't move it, so until then the
 * goal isn't offered a raise.
 */
function legacyBlock(goal: Doc<'goals'>): string | null {
  return goal.stakeId === undefined && goal.stake !== undefined
    ? 'This goal’s stake can’t be changed yet'
    : null;
}

async function readTarget(
  ctx: QueryCtx,
  user: Doc<'users'>,
  target: Target,
): Promise<RaiseTarget | null> {
  if ('habitId' in target) {
    const habit = await ctx.db.get('habits', target.habitId);
    if (habit === null || habit.userId !== user._id) return null;
    const stake = habit.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
    return {
      commitment: 'habit',
      title: habit.title,
      description: habit.description,
      timesPerWeek: habit.timesPerWeek,
      proofMethod: habit.proofMethod,
      timerMinutes: habit.timerMinutes,
      stake: stake === null ? null : stakeView(stake),
      blocked: habitBlock(habit) ?? stakeBlock(stake),
    };
  }

  const goal = await ctx.db.get('goals', target.goalId);
  if (goal === null || goal.userId !== user._id) return null;
  const stake = goal.stakeId === undefined ? null : await ctx.db.get('stakes', goal.stakeId);
  return {
    commitment: 'goal',
    title: goal.title,
    description: goal.description,
    dueAt: goal.dueAt,
    stake: stake === null ? null : stakeView(stake),
    blocked: goalBlock(goal) ?? legacyBlock(goal) ?? stakeBlock(stake),
  };
}

/** The commitment as the raise screen needs it, or null when it's gone or not the caller's. */
export const target = query({
  args: { target: targetValidator },
  returns: v.union(raiseTargetValidator, v.null()),
  handler: async (ctx, args): Promise<RaiseTarget | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    return await readTarget(ctx, user, args.target);
  },
});

const firstCommitmentValidator = v.object({
  target: targetValidator,
  title: v.string(),
  stake: v.union(stakeViewValidator, v.null()),
  /** When onboarding finished; the nudge only runs for a while after. */
  onboardedAt: v.number(),
  dueAt: v.optional(v.number()),
});

type FirstCommitment = typeof firstCommitmentValidator.type;

/**
 * The commitment made during onboarding, while money could still go on it.
 * Onboarding can't take a card, so this is what the Today nudge offers to
 * raise. It's the oldest goal or habit the user still has; the app applies the
 * time window, since queries don't read the clock.
 */
export const firstCommitment = query({
  args: {},
  returns: v.union(firstCommitmentValidator, v.null()),
  handler: async (ctx): Promise<FirstCommitment | null> => {
    const user = await getCurrentUserOrNull(ctx);
    const onboardedAt = user?.onboarding?.completedAt;
    if (user === null || onboardedAt === undefined) return null;

    const habit = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .first();
    const goal = await ctx.db
      .query('goals')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .first();
    const oldest =
      habit !== null && (goal === null || habit._creationTime <= goal._creationTime)
        ? { habitId: habit._id }
        : goal !== null
          ? { goalId: goal._id }
          : null;
    if (oldest === null) return null;

    const found = await readTarget(ctx, user, oldest);
    // Anything short of money can still take it: money starts at $10 at most.
    if (found === null || found.blocked !== null || found.stake?.kind === 'money') return null;

    return {
      target: oldest,
      title: found.title,
      stake: found.stake,
      onboardedAt,
      dueAt: found.dueAt,
    };
  },
});
