import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation } from './_generated/server';
import { DEFAULT_HABITS } from './lib/defaultHabits';

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

    const userId = await ctx.db.insert('users', {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      pictureUrl: identity.pictureUrl,
      createdAt: Date.now(),
    });

    await Promise.all(
      DEFAULT_HABITS.map((habit, index) =>
        ctx.db.insert('habits', { ...habit, userId, order: index }),
      ),
    );

    return userId;
  },
});
