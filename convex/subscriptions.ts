import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { env, internalMutation, internalQuery, query } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { authedAction, authedMutation } from './lib/customFunctions';
import { isPro, isSubscriptionActive } from './lib/entitlements';
import { requireDevOverrides } from './lib/lockout';
import { PRO_ENTITLEMENT } from './revenuecat';
import schema from './schema';

/**
 * The signed-in user's subscription row, or `null` when they never had one.
 * Whether it currently grants Pro is the client's call
 * (`isSubscriptionActive` in `lib/entitlements.ts`): a query must not read the
 * clock, and the row's `expiresAt` is enough to decide.
 *
 * Tolerates a missing user row like `habits.list`: this subscribes at the same
 * moment `users.storeUser` runs on first sign-in.
 */
export const current = query({
  args: {},
  returns: v.union(schema.doc('subscriptions'), v.null()),
  handler: async (ctx): Promise<Doc<'subscriptions'> | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) {
      return null;
    }

    return await ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();
  },
});

/** For actions, which cannot read the table: whether `userId` has Pro at `now`. */
export const hasPro = internalQuery({
  args: { userId: v.id('users'), now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => await isPro(ctx, args.userId, args.now),
});

const syncedValidator = v.object({
  status: v.union(v.literal('trial'), v.literal('active'), v.literal('cancelled')),
  productId: v.string(),
  store: v.string(),
  periodType: v.string(),
  environment: v.union(v.literal('SANDBOX'), v.literal('PRODUCTION')),
  purchasedAt: v.number(),
  expiresAt: v.optional(v.number()),
  willRenew: v.boolean(),
});

type Synced = typeof syncedValidator.type;

/**
 * Writes what `sync` read from RevenueCat, but only over nothing or over a row
 * that no longer grants Pro: a live row came from the webhook and knows more.
 * `lastEventAt` is the purchase time, so the webhook's own events still land.
 */
export const applySynced = internalMutation({
  args: { userId: v.id('users'), synced: syncedValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now();
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (existing !== null && isSubscriptionActive(existing, now)) return null;

    const fields = {
      userId: args.userId,
      ...args.synced,
      rcAppUserId: args.userId,
      lastEventAt: args.synced.purchasedAt,
      lastEventType: 'SYNC',
      updatedAt: now,
    };
    if (existing === null) {
      await ctx.db.insert('subscriptions', fields);
    } else {
      await ctx.db.replace('subscriptions', existing._id, fields);
    }
    return null;
  },
});

/**
 * Called by the app right after a purchase or restore, so the first
 * commitment is not refused while the webhook is still on its way. Reads the
 * customer from RevenueCat's v1 subscriber endpoint, like
 * `lockouts.confirmReentry`. Returns whether the user now has Pro.
 */
export const sync = authedAction({
  args: {},
  returns: v.object({ isPro: v.boolean() }),
  handler: async (ctx): Promise<{ isPro: boolean }> => {
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

    const now = Date.now();
    const synced = parseProEntitlement(await response.json(), now);
    if (synced !== null) {
      await ctx.runMutation(internal.subscriptions.applySynced, { userId: ctx.user._id, synced });
    }
    const pro: boolean = await ctx.runQuery(internal.subscriptions.hasPro, {
      userId: ctx.user._id,
      now,
    });
    return { isPro: pro };
  },
});

/**
 * The live `ante_pro` entitlement from a v1 subscriber body, with the details
 * of the subscription behind it; `null` when there is none, or it has lapsed.
 */
export function parseProEntitlement(body: unknown, now: number): Synced | null {
  if (!isRecord(body) || !isRecord(body.subscriber)) return null;
  const { entitlements, subscriptions } = body.subscriber;
  if (!isRecord(entitlements) || !isRecord(entitlements[PRO_ENTITLEMENT])) return null;
  const entitlement = entitlements[PRO_ENTITLEMENT];

  const expiresAt = parseDate(entitlement.expires_date);
  if (expiresAt !== undefined && expiresAt <= now) return null;
  const productId =
    typeof entitlement.product_identifier === 'string' ? entitlement.product_identifier : 'unknown';
  const sub =
    isRecord(subscriptions) && isRecord(subscriptions[productId]) ? subscriptions[productId] : {};

  const unsubscribed = parseDate(sub.unsubscribe_detected_at) !== undefined;
  const billingIssue = parseDate(sub.billing_issues_detected_at) !== undefined;
  const periodType = typeof sub.period_type === 'string' ? sub.period_type.toUpperCase() : 'NORMAL';

  return {
    status: unsubscribed ? 'cancelled' : periodType === 'TRIAL' ? 'trial' : 'active',
    productId,
    store: typeof sub.store === 'string' ? sub.store.toUpperCase() : 'unknown',
    periodType,
    environment: sub.is_sandbox === true ? 'SANDBOX' : 'PRODUCTION',
    purchasedAt: parseDate(entitlement.purchase_date) ?? now,
    expiresAt,
    willRenew: !unsubscribed && !billingIssue,
  };
}

function parseDate(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DEV_PRO_DAYS = 30;

/**
 * Developer tool: a month of Pro without the App Store, so the app can be
 * tested past the paywall. `lastEventAt: 0` lets any real webhook replace it.
 * Dev and preview deployments only.
 */
export const devGrantPro = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    requireDevOverrides();
    const now = Date.now();
    const fields = {
      userId: ctx.user._id,
      status: 'trial' as const,
      productId: 'dev_override',
      store: 'DEV',
      periodType: 'TRIAL',
      environment: 'SANDBOX' as const,
      purchasedAt: now,
      expiresAt: now + DEV_PRO_DAYS * 24 * 60 * 60 * 1000,
      willRenew: false,
      rcAppUserId: ctx.user._id,
      lastEventAt: 0,
      lastEventType: 'DEV_GRANT',
      updatedAt: now,
    };
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .unique();
    if (existing === null) {
      await ctx.db.insert('subscriptions', fields);
    } else {
      await ctx.db.replace('subscriptions', existing._id, fields);
    }
    return null;
  },
});

/** Developer tool: end Pro now, to see the paused state. Dev and preview deployments only. */
export const devEndPro = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    requireDevOverrides();
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .unique();
    if (existing !== null) {
      const now = Date.now();
      await ctx.db.patch('subscriptions', existing._id, {
        status: 'expired',
        expiresAt: now,
        willRenew: false,
        updatedAt: now,
      });
    }
    return null;
  },
});
