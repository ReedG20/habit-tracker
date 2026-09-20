import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, mutation } from './_generated/server';
import { getCurrentUser } from './lib/auth';
import schema from './schema';

/**
 * Upserts the signed-in Clerk identity into the `users` table. Called on every
 * launch from the authenticated layout, so it only writes when something changed.
 */
export const storeUser = mutation({
  args: {},
  returns: v.id('users'),
  handler: async (ctx): Promise<Id<'users'>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error('Not authenticated');
    }

    const name = identity.name ?? identity.nickname ?? 'Anonymous';
    const email = identity.email ?? '';

    const existing = await ctx.db
      .query('users')
      .withIndex('by_token', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique();

    if (existing !== null) {
      const changed =
        existing.name !== name ||
        existing.email !== email ||
        existing.pictureUrl !== identity.pictureUrl;

      if (changed) {
        await ctx.db.patch('users', existing._id, {
          name,
          email,
          pictureUrl: identity.pictureUrl,
          updatedAt: Date.now(),
        });
      }

      return existing._id;
    }

    return await ctx.db.insert('users', {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      pictureUrl: identity.pictureUrl,
      createdAt: Date.now(),
    });
  },
});

/** The signed-in user's row, for actions (which have no `ctx.db`). Throws when missing. */
export const current = internalQuery({
  args: {},
  returns: schema.doc('users'),
  handler: async (ctx): Promise<Doc<'users'>> => {
    return await getCurrentUser(ctx);
  },
});

/**
 * Records the Stripe customer, first writer wins: two concurrent `beginStake`
 * calls may each create a customer, and both must end up using the same one.
 * Returns whichever id is stored afterwards.
 */
export const setStripeCustomerId = internalMutation({
  args: { userId: v.id('users'), stripeCustomerId: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const user = await ctx.db.get('users', args.userId);
    if (user === null) {
      throw new Error('User not found');
    }

    if (user.stripeCustomerId !== undefined) {
      return user.stripeCustomerId;
    }

    await ctx.db.patch('users', args.userId, { stripeCustomerId: args.stripeCustomerId });

    return args.stripeCustomerId;
  },
});
