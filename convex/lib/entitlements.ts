// Only type imports from `_generated` so the app bundle can import
// `isSubscriptionActive` too (`src/hooks/use-subscription.ts`).
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type SubscriptionLike = Pick<Doc<'subscriptions'>, 'status' | 'expiresAt'>;

/**
 * Whether a subscription row grants Pro at `now`. Access follows the expiry
 * rather than the status, so a cancelled or billing-issue subscription keeps
 * working until RevenueCat says it ended. Pure, so callers choose the clock.
 */
export function isSubscriptionActive(subscription: SubscriptionLike, now: number): boolean {
  if (subscription.expiresAt === undefined) {
    return subscription.status !== 'expired';
  }
  return subscription.expiresAt > now;
}

/**
 * Server-side Pro check for gating mutations and actions. Reads the wall
 * clock, so do not call it from a query: pass `now` in from the client there.
 */
export async function isPro(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  now: number = Date.now(),
): Promise<boolean> {
  const subscription = await ctx.db
    .query('subscriptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  return subscription !== null && isSubscriptionActive(subscription, now);
}
