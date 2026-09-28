import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { authedMutation } from './lib/customFunctions';
import { daysBefore, daysBetween, nextDay } from './lib/days';
import { localDay, requireDevOverrides } from './lib/lockout';
import { notifyFrozen, notifyThawed, touchReminders } from './lib/notify';
import type { LockoutDays } from './lib/stakeRules';
import { cancelJob } from './lib/stakes';
import { zonedInstant } from './lib/zonedTime';

/**
 * Freezes: what a lockout stake does when its habit's streak breaks. Every
 * habit is frozen for the days the user chose (1, 3 or 7): nothing can be
 * logged and nothing is judged, and streaks bridge across the gap. Goals keep
 * running. A freeze lifts on its own at the local midnight after its last day.
 */

/** How far back a check or streak looks for freezes; far more than any run spans. */
const MAX_FREEZES = 50;

export async function activeFreeze(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'freezes'> | null> {
  return await ctx.db
    .query('freezes')
    .withIndex('by_user_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
    .first();
}

/** Refuses logging a habit while frozen. Goal proof deliberately skips this. */
export async function requireHabitsUnfrozen(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  const freeze = await activeFreeze(ctx, userId);
  if (freeze !== null) {
    throw new Error('Your habits are frozen right now. Goals still count.');
  }
}

/** Every frozen local day that falls between `from` and `to`. */
export async function frozenDaysBetween(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  from: string,
  to: string,
): Promise<Set<string>> {
  const freezes = await ctx.db
    .query('freezes')
    .withIndex('by_user_and_endDay', (q) => q.eq('userId', userId).gte('endDay', from))
    .take(MAX_FREEZES);

  const days = new Set<string>();
  for (const freeze of freezes) {
    if (freeze.startDay > to) continue;
    const start = freeze.startDay < from ? from : freeze.startDay;
    const end = freeze.endDay > to ? to : freeze.endDay;
    for (const day of daysBetween(start, end)) days.add(day);
  }
  return days;
}

/**
 * Freezes every habit for the longest of the lockouts that just came due,
 * starting today (the day the miss was found). If a freeze is already
 * running, it's extended when this one would end later.
 */
export async function startOrExtendFreeze(
  ctx: MutationCtx,
  user: Doc<'users'>,
  stakes: Extract<Doc<'stakes'>, { kind: 'lockout' }>[],
  now: number,
): Promise<void> {
  if (stakes.length === 0) return;
  const timeZone = user.timeZone ?? 'UTC';
  const days = Math.max(...stakes.map((stake) => stake.days)) as LockoutDays;
  const today = localDay(now, timeZone);
  const endDay = daysBefore(today, -(days - 1));

  const existing = await activeFreeze(ctx, user._id);
  let freezeId: Id<'freezes'>;
  if (existing !== null && existing.endDay >= endDay) {
    freezeId = existing._id;
  } else {
    const endsAt = zonedInstant(nextDay(endDay), 0, 0, timeZone);
    if (existing !== null) {
      await cancelJob(ctx, existing.liftJobId);
      freezeId = existing._id;
      await ctx.db.patch('freezes', freezeId, { endDay, endsAt, days });
    } else {
      freezeId = await ctx.db.insert('freezes', {
        userId: user._id,
        startDay: today,
        endDay,
        endsAt,
        days,
        status: 'active',
        createdAt: now,
      });
    }
    const liftJobId = await ctx.scheduler.runAt(endsAt, internal.freezes.lift, { freezeId });
    await ctx.db.patch('freezes', freezeId, { liftJobId });
  }

  for (const stake of stakes) {
    await ctx.db.patch('stakes', stake._id, { freezeId });
  }

  const freeze = await ctx.db.get('freezes', freezeId);
  if (freeze !== null) {
    await notifyFrozen(ctx, stakes[0], untilLabel(freeze, timeZone));
  }
}

/** "Saturday": the first day habits count again. */
function untilLabel(freeze: Doc<'freezes'>, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(
    new Date(freeze.endsAt + 60 * 60 * 1000),
  );
}

/** Runs at the local midnight after the last frozen day. */
export const lift = internalMutation({
  args: { freezeId: v.id('freezes') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const freeze = await ctx.db.get('freezes', args.freezeId);
    if (freeze === null || freeze.status !== 'active') return null;
    // Extended since this job was scheduled: the later job lifts it.
    if (freeze.endsAt > Date.now() + 60 * 1000) return null;

    await ctx.db.patch('freezes', freeze._id, { status: 'lifted', liftJobId: undefined });
    // Habit reminders were off while frozen; today's come back from here.
    await touchReminders(ctx, freeze.userId);
    await notifyThawed(ctx, freeze.userId);
    return null;
  },
});

const currentFreezeValidator = v.object({
  _id: v.id('freezes'),
  startDay: v.string(),
  endDay: v.string(),
  endsAt: v.number(),
});

/** The signed-in user's freeze, for the banner and the frozen habit cards. */
export const current = query({
  args: {},
  returns: v.union(currentFreezeValidator, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;
    const freeze = await activeFreeze(ctx, user._id);
    if (freeze === null) return null;
    return {
      _id: freeze._id,
      startDay: freeze.startDay,
      endDay: freeze.endDay,
      endsAt: freeze.endsAt,
    };
  },
});

/** Developer tool: freeze every habit for `days`, as if a lockout came due. */
export const devFreeze = authedMutation({
  args: { days: v.union(v.literal(1), v.literal(3), v.literal(7)) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireDevOverrides();
    const now = Date.now();
    const stakeId = await ctx.db.insert('stakes', {
      kind: 'lockout',
      userId: ctx.user._id,
      title: 'Developer freeze',
      createdAt: now,
      lostAt: now,
      seenAt: now,
      status: 'triggered',
      days: args.days,
    });
    const stake = await ctx.db.get('stakes', stakeId);
    if (stake?.kind === 'lockout') await startOrExtendFreeze(ctx, ctx.user, [stake], now);
    return null;
  },
});

/** Developer tool: lift the freeze now. */
export const devLift = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    requireDevOverrides();
    const freeze = await activeFreeze(ctx, ctx.user._id);
    if (freeze === null) return null;
    await cancelJob(ctx, freeze.liftJobId);
    await ctx.db.patch('freezes', freeze._id, {
      status: 'lifted',
      liftJobId: undefined,
      endDay: daysBefore(localDay(Date.now(), ctx.user.timeZone ?? 'UTC'), 1),
      endsAt: Date.now(),
    });
    await touchReminders(ctx, ctx.user._id);
    return null;
  },
});
