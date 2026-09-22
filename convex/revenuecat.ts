import { v, type Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import type { subscriptionStatusValidator } from './schema';

/** The RevenueCat entitlement every Ante Pro product is attached to. */
export const PRO_ENTITLEMENT = 'ante_pro';

/**
 * Event types the webhook forwards; anything else gets a 200 and is dropped in
 * `http.ts`. `TEST` is the dashboard's "Send test event" button.
 */
export const handledEventTypes = [
  'TEST',
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_PAUSED',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TRANSFER',
  'TEMPORARY_ENTITLEMENT_GRANT',
] as const;

export type HandledEventType = (typeof handledEventTypes)[number];

/** Fields every RevenueCat event carries, however it is typed. */
const baseEventFields = {
  /** Our `users._id` once the app has logged in; an `$RCAnonymousID:` before. */
  appUserId: v.string(),
  /** Every id RevenueCat has merged into this customer, ours among them. */
  aliases: v.array(v.string()),
  eventTimestampMs: v.number(),
  environment: v.union(v.literal('SANDBOX'), v.literal('PRODUCTION')),
};

/** Events that describe the state of one subscription. */
export const subscriptionEventValidator = v.object({
  type: v.union(
    v.literal('INITIAL_PURCHASE'),
    v.literal('RENEWAL'),
    v.literal('CANCELLATION'),
    v.literal('UNCANCELLATION'),
    v.literal('NON_RENEWING_PURCHASE'),
    v.literal('SUBSCRIPTION_PAUSED'),
    v.literal('EXPIRATION'),
    v.literal('BILLING_ISSUE'),
    v.literal('PRODUCT_CHANGE'),
    v.literal('SUBSCRIPTION_EXTENDED'),
    v.literal('TEMPORARY_ENTITLEMENT_GRANT'),
  ),
  ...baseEventFields,
  entitlementIds: v.array(v.string()),
  productId: v.optional(v.string()),
  periodType: v.optional(v.string()),
  store: v.optional(v.string()),
  purchasedAtMs: v.optional(v.number()),
  expirationAtMs: v.optional(v.number()),
  cancelReason: v.optional(v.string()),
  expirationReason: v.optional(v.string()),
  newProductId: v.optional(v.string()),
});

/**
 * What `http.ts` extracts from an authenticated RevenueCat event: only the
 * fields the state machine needs, never the raw payload.
 */
export const webhookEventValidator = v.union(
  v.object({ type: v.literal('TEST'), ...baseEventFields }),
  v.object({
    type: v.literal('TRANSFER'),
    ...baseEventFields,
    transferredFrom: v.array(v.string()),
    transferredTo: v.array(v.string()),
  }),
  subscriptionEventValidator,
);

export type WebhookEvent = Infer<typeof webhookEventValidator>;
export type SubscriptionEvent = Infer<typeof subscriptionEventValidator>;
type SubscriptionStatus = Infer<typeof subscriptionStatusValidator>;

/**
 * Applies one webhook event to the user's `subscriptions` row. Dedupe and the
 * state change share a transaction, as in `stripe.handleEvent`. Never throws
 * for an event we cannot place: RevenueCat would retry it five times.
 */
export const handleEvent = internalMutation({
  args: { eventId: v.string(), event: webhookEventValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const seen = await ctx.db
      .query('revenuecatEvents')
      .withIndex('by_event_id', (q) => q.eq('eventId', args.eventId))
      .unique();
    if (seen !== null) {
      return null;
    }
    await ctx.db.insert('revenuecatEvents', {
      eventId: args.eventId,
      type: args.event.type,
      receivedAt: Date.now(),
    });

    const { event } = args;
    if (event.type === 'TEST') {
      return null;
    }
    if (event.type === 'TRANSFER') {
      await transfer(ctx, args.eventId, event);
      return null;
    }
    if (!event.entitlementIds.includes(PRO_ENTITLEMENT)) {
      // A product that is not attached to Pro; nothing to mirror.
      return null;
    }

    const userId = await resolveUser(ctx, [event.appUserId, ...event.aliases]);
    if (userId === null) {
      // An id from another deployment (sandbox events hitting prod), or a
      // customer who purchased before ever signing in.
      console.warn(`RevenueCat ${event.type} ${args.eventId} matched no user`);
      return null;
    }

    const existing = await subscriptionOf(ctx, userId);
    if (existing !== null && event.eventTimestampMs < existing.lastEventAt) {
      // Delivery order is not guaranteed; a newer event already won.
      return null;
    }

    const next = deriveSubscription(event, existing, userId);
    if (existing === null) {
      await ctx.db.insert('subscriptions', next);
    } else {
      await ctx.db.replace('subscriptions', existing._id, next);
    }
    return null;
  },
});

type SubscriptionFields = Omit<Doc<'subscriptions'>, '_id' | '_creationTime'>;

/**
 * The row after `event`, given the row before it. Every event type rewrites
 * the whole row from the event, falling back to the previous row for fields
 * the event does not carry (a CANCELLATION still has `expiration_at_ms`, but
 * a BILLING_ISSUE may not name the product).
 */
function deriveSubscription(
  event: SubscriptionEvent,
  previous: Doc<'subscriptions'> | null,
  userId: Id<'users'>,
): SubscriptionFields {
  const { status, willRenew } = statusFor(event, previous);
  return {
    userId,
    status,
    productId: event.productId ?? previous?.productId ?? 'unknown',
    store: event.store ?? previous?.store ?? 'unknown',
    periodType: event.periodType ?? previous?.periodType ?? 'NORMAL',
    environment: event.environment,
    purchasedAt: event.purchasedAtMs ?? previous?.purchasedAt ?? event.eventTimestampMs,
    expiresAt: event.expirationAtMs ?? previous?.expiresAt,
    willRenew,
    pendingProductId: event.type === 'PRODUCT_CHANGE' ? event.newProductId : undefined,
    cancelReason: event.type === 'CANCELLATION' ? event.cancelReason : undefined,
    expirationReason: event.type === 'EXPIRATION' ? event.expirationReason : undefined,
    rcAppUserId: event.appUserId,
    lastEventAt: event.eventTimestampMs,
    lastEventType: event.type,
    updatedAt: Date.now(),
  };
}

function statusFor(
  event: SubscriptionEvent,
  previous: Doc<'subscriptions'> | null,
): { status: SubscriptionStatus; willRenew: boolean } {
  const paying: SubscriptionStatus = event.periodType === 'TRIAL' ? 'trial' : 'active';
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'SUBSCRIPTION_EXTENDED':
    case 'PRODUCT_CHANGE':
      // A RENEWAL after a CANCELLATION means the user re-subscribed.
      return { status: paying, willRenew: true };
    case 'NON_RENEWING_PURCHASE':
    case 'TEMPORARY_ENTITLEMENT_GRANT':
      return { status: paying, willRenew: false };
    case 'CANCELLATION':
      return { status: 'cancelled', willRenew: false };
    case 'BILLING_ISSUE':
      return { status: 'billing_issue', willRenew: previous?.willRenew ?? true };
    case 'SUBSCRIPTION_PAUSED':
      return { status: 'paused', willRenew: false };
    case 'EXPIRATION':
      return { status: 'expired', willRenew: false };
  }
}

/**
 * RevenueCat moved the purchases from one customer to another (typically the
 * same Apple ID signing into a second Ante account). The row follows them.
 */
async function transfer(
  ctx: MutationCtx,
  eventId: string,
  event: Extract<WebhookEvent, { type: 'TRANSFER' }>,
): Promise<void> {
  const fromUserId = await resolveUser(ctx, event.transferredFrom);
  const toUserId = await resolveUser(ctx, event.transferredTo);
  if (fromUserId === null || toUserId === null || fromUserId === toUserId) {
    console.warn(`RevenueCat TRANSFER ${eventId} did not map to two users`);
    return;
  }

  const source = await subscriptionOf(ctx, fromUserId);
  if (source === null) {
    return;
  }
  const displaced = await subscriptionOf(ctx, toUserId);
  if (displaced !== null) {
    await ctx.db.delete('subscriptions', displaced._id);
  }
  await ctx.db.patch('subscriptions', source._id, {
    userId: toUserId,
    rcAppUserId: event.appUserId,
    lastEventAt: event.eventTimestampMs,
    lastEventType: event.type,
    updatedAt: Date.now(),
  });
}

/**
 * The first candidate that is one of our user ids. Ids are trusted only
 * because the webhook's Authorization header was checked; an id minted by
 * another deployment normalizes but has no row, so both checks are needed.
 */
async function resolveUser(ctx: MutationCtx, candidates: string[]): Promise<Id<'users'> | null> {
  for (const candidate of candidates) {
    const normalized = ctx.db.normalizeId('users', candidate);
    if (normalized === null) continue;
    const user = await ctx.db.get('users', normalized);
    if (user !== null) return user._id;
  }
  return null;
}

async function subscriptionOf(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'subscriptions'> | null> {
  return await ctx.db
    .query('subscriptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}
