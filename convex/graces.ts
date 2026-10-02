import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { authedMutation } from './lib/customFunctions';
import { DAILY, targetPerWeek } from './lib/frequency';
import { graceStakeLine, type GraceStake } from './lib/graceCopy';
import { graceReasonValidator } from './lib/graceSchema';
import { localDay, requireDevOverrides } from './lib/lockout';

/**
 * What the app reads and writes about the one-time reprieve (`lib/grace.ts`):
 * the screen that opens when it's used, and why the user says they missed.
 *
 * A person gets one reprieve, which covers every stake missed in that moment,
 * so all of a user's grace rows are the same batch.
 */

/** The most rows one reprieve can cover: every habit, missed the same day. */
const MAX_BATCH = 20;

const graceStakeValidator = v.union(
  v.object({ kind: v.literal('money'), cents: v.number() }),
  v.object({ kind: v.literal('friend'), name: v.string() }),
  v.object({ kind: v.literal('lockout'), days: v.number() }),
);

export const graceViewValidator = v.object({
  graceId: v.id('graces'),
  /** The first stake it covered, whose contract the screen holds up. */
  stakeId: v.id('stakes'),
  kind: v.union(v.literal('waived'), v.literal('extended')),
  /** Every commitment it covered, and what each had on the line. */
  titles: v.array(v.string()),
  stakes: v.array(graceStakeValidator),
  habitId: v.optional(v.id('habits')),
  /** The habit's still there to open. */
  habitExists: v.boolean(),
  goalId: v.optional(v.id('goals')),
  /** The goal was proven since, so there's nothing left to send. */
  goalDone: v.boolean(),
  missedPeriod: v.optional(v.string()),
  weekly: v.boolean(),
  originalDueAt: v.optional(v.number()),
  extendedTo: v.optional(v.number()),
  grantedAt: v.number(),
  seen: v.boolean(),
  reason: v.optional(graceReasonValidator),
});

export type GraceView = typeof graceViewValidator.type;

async function batchOf(ctx: QueryCtx, userId: Id<'users'>): Promise<Doc<'graces'>[]> {
  const rows = await ctx.db
    .query('graces')
    .withIndex('by_user_and_seen', (q) => q.eq('userId', userId))
    .take(MAX_BATCH);
  return rows.sort((a, b) => a._creationTime - b._creationTime);
}

async function viewOf(ctx: QueryCtx, rows: Doc<'graces'>[]): Promise<GraceView | null> {
  const first = rows[0];
  if (first === undefined) return null;

  const stakes: GraceStake[] = [];
  for (const row of rows) {
    const stake = await ctx.db.get('stakes', row.stakeId);
    if (stake !== null) stakes.push(graceStakeLine(stake));
  }
  const [habit, goal] = await Promise.all([
    first.habitId === undefined ? null : ctx.db.get('habits', first.habitId),
    first.goalId === undefined ? null : ctx.db.get('goals', first.goalId),
  ]);

  return {
    graceId: first._id,
    stakeId: first.stakeId,
    kind: first.kind,
    titles: rows.map((row) => row.title),
    stakes,
    habitId: first.habitId,
    habitExists: habit !== null,
    goalId: first.goalId,
    goalDone: goal?.completedAt !== undefined,
    missedPeriod: first.missedPeriod,
    weekly: habit !== null && targetPerWeek(habit) < DAILY,
    originalDueAt: first.originalDueAt,
    extendedTo: first.extendedTo,
    grantedAt: first.grantedAt,
    seen: first.seenAt !== undefined,
    reason: first.reason,
  };
}

/** The reprieve, if it was just used and the user hasn't seen it; the app opens it full screen. */
export const unseen = query({
  args: {},
  returns: v.union(graceViewValidator, v.null()),
  handler: async (ctx): Promise<GraceView | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const unseenRow = await ctx.db
      .query('graces')
      .withIndex('by_user_and_seen', (q) => q.eq('userId', user._id).eq('seenAt', undefined))
      .first();
    if (unseenRow === null) return null;
    return await viewOf(ctx, await batchOf(ctx, user._id));
  },
});

/** The reprieve by any of its ids, for the screen and the push that links to it. */
export const get = query({
  args: { graceId: v.id('graces') },
  returns: v.union(graceViewValidator, v.null()),
  handler: async (ctx, args): Promise<GraceView | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const row = await ctx.db.get('graces', args.graceId);
    if (row === null || row.userId !== user._id) return null;
    return await viewOf(ctx, await batchOf(ctx, user._id));
  },
});

export const markSeen = authedMutation({
  args: { graceId: v.id('graces') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get('graces', args.graceId);
    if (row === null || row.userId !== ctx.user._id) throw new Error('Not found');
    const now = Date.now();
    for (const grace of await batchOf(ctx, ctx.user._id)) {
      if (grace.seenAt === undefined) await ctx.db.patch('graces', grace._id, { seenAt: now });
    }
    return null;
  },
});

/** Why they missed, from the chips on the screen. They can change their mind. */
export const setReason = authedMutation({
  args: { graceId: v.id('graces'), reason: graceReasonValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get('graces', args.graceId);
    if (row === null || row.userId !== ctx.user._id) throw new Error('Not found');
    for (const grace of await batchOf(ctx, ctx.user._id)) {
      await ctx.db.patch('graces', grace._id, { reason: args.reason });
    }
    return null;
  },
});

/**
 * Developer tool: a made-up reprieve, to preview the screen. Replaces any
 * earlier one, so it can be run again. The stake it points at is already
 * released, so nothing is charged or emailed. Dev and preview deployments only.
 */
export const devGrace = authedMutation({
  args: {
    kind: v.union(v.literal('money'), v.literal('friend'), v.literal('lockout')),
    subject: v.union(v.literal('habit'), v.literal('goal')),
  },
  returns: v.id('graces'),
  handler: async (ctx, args): Promise<Id<'graces'>> => {
    requireDevOverrides();
    const now = Date.now();
    const userId = ctx.user._id;
    for (const old of await batchOf(ctx, userId)) await ctx.db.delete('graces', old._id);

    const habit =
      args.subject === 'habit'
        ? await ctx.db
            .query('habits')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .first()
        : null;
    const goal =
      args.subject === 'goal'
        ? await ctx.db
            .query('goals')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .first()
        : null;
    const title = habit?.title ?? goal?.title ?? 'Meditate for ten minutes';
    const common = {
      userId,
      habitId: habit?._id,
      goalId: goal?._id,
      title,
      createdAt: now,
      releasedAt: now,
      status: 'released' as const,
    };

    let stakeId: Id<'stakes'>;
    if (args.kind === 'money') {
      stakeId = await ctx.db.insert('stakes', {
        kind: 'money',
        ...common,
        amountCents: 2500,
        stripeCustomerId: 'cus_dev',
        stripePaymentMethodId: 'pm_dev',
      });
    } else if (args.kind === 'friend') {
      const friendId = await ctx.db.insert('friends', {
        userId,
        name: 'Sam',
        email: 'sam@example.com',
        // Opted out, so nothing real is ever sent to it.
        status: 'opted_out',
        optOutToken: `dev-${now}`,
        createdAt: now,
      });
      stakeId = await ctx.db.insert('stakes', {
        kind: 'friend',
        ...common,
        friendId,
        friendName: 'Sam',
        friendEmail: 'sam@example.com',
      });
    } else {
      stakeId = await ctx.db.insert('stakes', { kind: 'lockout', ...common, days: 3 });
    }

    const timeZone = ctx.user.timeZone ?? 'UTC';
    const hour = 60 * 60 * 1000;
    return await ctx.db.insert('graces', {
      userId,
      stakeId,
      kind: args.subject === 'habit' ? 'waived' : 'extended',
      habitId: habit?._id,
      goalId: goal?._id,
      title,
      missedPeriod: args.subject === 'habit' ? localDay(now - 24 * hour, timeZone) : undefined,
      originalDueAt: args.subject === 'goal' ? now - hour : undefined,
      extendedTo: args.subject === 'goal' ? now + 47 * hour : undefined,
      grantedAt: now,
      // Seen, as `accomplishments.devPreview`: opened directly, never popped up later.
      seenAt: now,
    });
  },
});
