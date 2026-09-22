import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
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
