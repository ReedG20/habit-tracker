import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { env, internalMutation, internalQuery, query, type MutationCtx } from './_generated/server';
import { deleteHabit } from './habits';
import { getCurrentUserOrNull } from './lib/auth';
import { authedAction, authedMutation } from './lib/customFunctions';
import { daysBefore, nextDay, previousDay, STREAK_WINDOW_DAYS, weekStart } from './lib/days';
import {
  activeLockout,
  devOverridesEnabled,
  findMisses,
  localDay,
  requireDevOverrides,
} from './lib/lockout';

/**
 * The lockout: a missed habit locks the whole app until a re-entry fee is
 * paid. `checkAll` runs hourly and locks anyone whose day (or week) just ended
 * short; the fee is a consumable in-app purchase that reaches us through the
 * RevenueCat webhook (`revenuecat.handleEvent`) or `confirmReentry`, whichever
 * lands first. Goals are untouched: they keep their deadlines and settle as
 * usual, and proof can still be submitted while locked.
 */

/** The consumable in-app purchase that lifts a lock. Mirrored in `src/lib/revenuecat.ts`. */
export const REENTRY_PRODUCT_ID = 'ante_reentry';

/** Users per `checkAll` transaction; each reads its habits and a few weeks of logs. */
const CHECK_BATCH = 50;

const missValidator = v.object({
  habitId: v.id('habits'),
  title: v.string(),
  kind: v.union(v.literal('day'), v.literal('week')),
  period: v.string(),
});

const currentLockoutValidator = v.object({
  _id: v.id('lockouts'),
  lockedAt: v.number(),
  misses: v.array(missValidator),
});

/**
 * The signed-in user's active lock, or null. Tolerates a missing user row like
 * `habits.list`, since the root navigator subscribes before `storeUser` lands.
 */
export const current = query({
  args: {},
  returns: v.union(currentLockoutValidator, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return null;

    const lockout = await activeLockout(ctx, user._id);
    if (lockout === null) return null;

    return { _id: lockout._id, lockedAt: lockout.lockedAt, misses: lockout.misses };
  },
});

export const isLocked = internalQuery({
  args: { userId: v.id('users') },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    return (await activeLockout(ctx, args.userId)) !== null;
  },
});

/** The hourly cron: checks every user in batches, chaining until the table is done. */
export const checkAll = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now();
    const page = await ctx.db
      .query('users')
      .paginate({ numItems: CHECK_BATCH, cursor: args.cursor ?? null });

    for (const user of page.page) {
      await checkUser(ctx, user, now);
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.lockouts.checkAll, {
        cursor: page.continueCursor,
      });
    }

    return null;
  },
});

/**
 * Checks every day from the user's last check through their local yesterday,
 * so a skipped cron run is caught up by the next one. Waits while a photo from
 * that span is still being judged, so a photo taken at 11:59 PM gets its verdict first.
 */
export async function checkUser(ctx: MutationCtx, user: Doc<'users'>, now: number): Promise<void> {
  const { timeZone, lastCheckedDay, accountableFrom } = user;
  if (timeZone === undefined || lastCheckedDay === undefined || accountableFrom === undefined) {
    return;
  }
  // Frozen while locked: days spent locked never count, since paying resets the cursor.
  if ((await activeLockout(ctx, user._id)) !== null) return;

  const today = localDay(now, timeZone);
  const to = previousDay(today);
  if (lastCheckedDay >= to) return;

  const oldest = daysBefore(to, STREAK_WINDOW_DAYS);
  const next = nextDay(lastCheckedDay);
  const from = next < oldest ? oldest : next;
  // A weekly habit is judged on its Sunday, over logs from its Monday on.
  const readFrom = weekStart(from);

  const verifications = await ctx.db
    .query('habitVerifications')
    .withIndex('by_user_and_day', (q) =>
      q.eq('userId', user._id).gte('day', readFrom).lte('day', to),
    )
    .collect();
  if (verifications.some((verification) => verification.status === 'pending')) return;

  const habits = await ctx.db
    .query('habits')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .collect();

  const completions = await ctx.db
    .query('habitCompletions')
    .withIndex('by_user_and_day', (q) =>
      q.eq('userId', user._id).gte('day', readFrom).lte('day', to),
    )
    .collect();

  const completedDays = new Map<Id<'habits'>, Set<string>>();
  for (const completion of completions) {
    const days = completedDays.get(completion.habitId) ?? new Set<string>();
    days.add(completion.day);
    completedDays.set(completion.habitId, days);
  }

  // A day whose latest photo check `failed` is excused: that was our error.
  const latest = new Map<string, Doc<'habitVerifications'>>();
  for (const verification of verifications) {
    const key = `${verification.habitId}|${verification.day}`;
    const seen = latest.get(key);
    if (seen === undefined || verification.createdAt > seen.createdAt) {
      latest.set(key, verification);
    }
  }
  const excusedDays = new Map<Id<'habits'>, Set<string>>();
  for (const verification of latest.values()) {
    if (verification.status !== 'failed') continue;
    const days = excusedDays.get(verification.habitId) ?? new Set<string>();
    days.add(verification.day);
    excusedDays.set(verification.habitId, days);
  }

  const misses = findMisses({ habits, completedDays, excusedDays, accountableFrom, from, to });

  await ctx.db.patch('users', user._id, { lastCheckedDay: to });

  // A habit deleted while still owed stays until its last period has been checked.
  for (const habit of habits) {
    if (habit.endsAfter !== undefined && habit.endsAfter <= to) {
      await deleteHabit(ctx, habit._id);
    }
  }

  if (misses.length > 0) {
    await ctx.db.insert('lockouts', {
      userId: user._id,
      status: 'active',
      lockedAt: now,
      misses,
    });
  }
}

/**
 * Lifts the lock and gives the user a fresh start: today is free, and the
 * check resumes from today, so the days spent locked are never judged.
 */
async function unlock(
  ctx: MutationCtx,
  user: Doc<'users'>,
  lockoutId: Id<'lockouts'>,
  now: number,
  fields: { waived?: boolean },
): Promise<void> {
  await ctx.db.patch('lockouts', lockoutId, { status: 'paid', paidAt: now, ...fields });

  if (user.timeZone !== undefined) {
    const today = localDay(now, user.timeZone);
    await ctx.db.patch('users', user._id, {
      accountableFrom: nextDay(today),
      lastCheckedDay: today,
    });
  }
}

export type ReentryPayment = {
  transactionId: string;
  productId: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  purchasedAt: number;
};

/**
 * Records one re-entry purchase and spends it on the active lock, if it was
 * bought after that lock began. Idempotent by transaction id, so the webhook
 * and `confirmReentry` can both report it. The purchase time is what makes a
 * duplicate harmless even if the two paths ever disagreed on the id: an old
 * purchase can never pay for a newer lock, and a payment that finds no lock
 * is recorded but never carried over to the next one.
 */
export async function applyReentryPayment(
  ctx: MutationCtx,
  userId: Id<'users'>,
  payment: ReentryPayment,
): Promise<void> {
  const seen = await ctx.db
    .query('reentryPayments')
    .withIndex('by_transaction_id', (q) => q.eq('transactionId', payment.transactionId))
    .unique();
  if (seen !== null) return;

  const user = await ctx.db.get('users', userId);
  if (user === null) return;

  const now = Date.now();
  const active = await activeLockout(ctx, userId);
  const lockout = active !== null && payment.purchasedAt >= active.lockedAt ? active : null;
  await ctx.db.insert('reentryPayments', {
    userId,
    transactionId: payment.transactionId,
    productId: payment.productId,
    environment: payment.environment,
    receivedAt: now,
    lockoutId: lockout?._id,
  });

  if (lockout !== null) {
    await unlock(ctx, user, lockout._id, now, {});
  }
}

const reentryPaymentValidator = v.object({
  transactionId: v.string(),
  productId: v.string(),
  environment: v.union(v.literal('SANDBOX'), v.literal('PRODUCTION')),
  purchasedAt: v.number(),
});

export const recordReentryPayments = internalMutation({
  args: { userId: v.id('users'), payments: v.array(reentryPaymentValidator) },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    for (const payment of args.payments) {
      await applyReentryPayment(ctx, args.userId, payment);
    }
    return (await activeLockout(ctx, args.userId)) !== null;
  },
});

/**
 * Called by the app straight after the store confirms a purchase, and by the
 * locked screen's "Already paid?" row. Asks RevenueCat for the user's re-entry
 * purchases directly, so unlocking does not wait on the webhook. Returns
 * whether the user is still locked.
 */
export const confirmReentry = authedAction({
  args: {},
  returns: v.object({ locked: v.boolean() }),
  handler: async (ctx): Promise<{ locked: boolean }> => {
    const secretKey = env.REVENUECAT_SECRET_API_KEY;
    if (secretKey === undefined || secretKey === '') {
      throw new Error('REVENUECAT_SECRET_API_KEY is not set on this deployment');
    }

    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(ctx.user._id)}`,
      { headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' } },
    );
    if (!response.ok) {
      throw new Error(`RevenueCat returned ${response.status}`);
    }

    const payments = parseReentryPurchases(await response.json());
    const locked: boolean = await ctx.runMutation(internal.lockouts.recordReentryPayments, {
      userId: ctx.user._id,
      payments,
    });
    return { locked };
  },
});

/**
 * `subscriber.non_subscriptions.ante_reentry` from RevenueCat's v1 subscriber
 * endpoint. `store_transaction_id`, where present, is the id the webhook
 * carries as `transaction_id`; otherwise RevenueCat's own `id` stands in, and
 * `applyReentryPayment`'s purchase-time rule keeps a mismatch harmless.
 */
function parseReentryPurchases(body: unknown): ReentryPayment[] {
  if (!isRecord(body) || !isRecord(body.subscriber)) return [];
  const nonSubscriptions = body.subscriber.non_subscriptions;
  if (!isRecord(nonSubscriptions)) return [];
  const purchases = nonSubscriptions[REENTRY_PRODUCT_ID];
  if (!Array.isArray(purchases)) return [];

  const payments: ReentryPayment[] = [];
  for (const purchase of purchases) {
    if (!isRecord(purchase)) continue;
    const transactionId = purchase.store_transaction_id ?? purchase.id;
    const purchasedAt =
      typeof purchase.purchase_date === 'string' ? Date.parse(purchase.purchase_date) : NaN;
    if (typeof transactionId !== 'string' || transactionId === '' || Number.isNaN(purchasedAt)) {
      continue;
    }
    payments.push({
      transactionId,
      productId: REENTRY_PRODUCT_ID,
      environment: purchase.is_sandbox === true ? 'SANDBOX' : 'PRODUCTION',
      purchasedAt,
    });
  }
  return payments;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether this deployment honours the developer tools below and `force` on deletes. */
export const devOverrides = query({
  args: {},
  returns: v.boolean(),
  handler: async (): Promise<boolean> => devOverridesEnabled(),
});

/** Developer tool: lock now, blaming every habit. Dev and preview deployments only. */
export const devLock = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    requireDevOverrides();
    if ((await activeLockout(ctx, ctx.user._id)) !== null) return null;

    const today = localDay(Date.now(), ctx.user.timeZone ?? 'UTC');
    const habits = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .take(20);

    await ctx.db.insert('lockouts', {
      userId: ctx.user._id,
      status: 'active',
      lockedAt: Date.now(),
      misses: habits.map((habit) => ({
        habitId: habit._id,
        title: habit.title,
        kind: 'day' as const,
        period: today,
      })),
    });
    return null;
  },
});

/** Developer tool: lift the lock without paying. Dev and preview deployments only. */
export const devUnlock = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    requireDevOverrides();
    const lockout = await activeLockout(ctx, ctx.user._id);
    if (lockout !== null) {
      await unlock(ctx, ctx.user, lockout._id, Date.now(), { waived: true });
    }
    return null;
  },
});
