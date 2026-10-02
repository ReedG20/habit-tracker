import { v } from 'convex/values';
import Stripe from 'stripe';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, mutation } from './_generated/server';
import { getCurrentUser } from './lib/auth';
import { authedAction, authedMutation } from './lib/customFunctions';
import { nextDay } from './lib/days';
import { isValidTimeZone, localDay } from './lib/lockout';
import { touchReminders } from './lib/notify';
import { stripeClient } from './lib/stripe';
import schema, { onboardingValidator } from './schema';

/**
 * The fields that start the lockout check once the device's zone is known.
 * The day it is first reported is free: nobody is judged on a day that began
 * before the lockout existed for them.
 */
function timeZoneFields(
  timeZone: string | undefined,
  existing: Doc<'users'> | null,
  now: number,
): Partial<Doc<'users'>> {
  if (timeZone === undefined || !isValidTimeZone(timeZone)) return {};
  if (existing?.timeZone === timeZone) return {};
  if (existing?.lastCheckedDay !== undefined) return { timeZone };

  const today = localDay(now, timeZone);
  return { timeZone, accountableFrom: nextDay(today), lastCheckedDay: today };
}

/**
 * Upserts the signed-in Clerk identity into the `users` table. Called on every
 * launch from the authenticated layout, so it only writes when something changed.
 * `timeZone` is the device's IANA zone; older builds leave it out.
 */
export const storeUser = mutation({
  args: { timeZone: v.optional(v.string()) },
  returns: v.id('users'),
  handler: async (ctx, args): Promise<Id<'users'>> => {
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

    const now = Date.now();
    const zone = timeZoneFields(args.timeZone, existing, now);

    if (existing !== null) {
      const changed =
        existing.name !== name ||
        existing.email !== email ||
        existing.pictureUrl !== identity.pictureUrl ||
        Object.keys(zone).length > 0;

      if (changed) {
        await ctx.db.patch('users', existing._id, {
          name,
          email,
          pictureUrl: identity.pictureUrl,
          ...zone,
          updatedAt: now,
        });
      }
      // A new zone moves tonight's midnight, and every reminder with it.
      if (zone.timeZone !== undefined) {
        await touchReminders(ctx, existing._id);
      }

      return existing._id;
    }

    return await ctx.db.insert('users', {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      pictureUrl: identity.pictureUrl,
      ...zone,
      createdAt: now,
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

/**
 * Saves the first-run survey. A replay overwrites the previous answers, so the
 * row always reflects the latest run.
 */
export const saveOnboarding = authedMutation({
  args: onboardingValidator.omit('completedAt').fields,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch('users', ctx.user._id, {
      onboarding: {
        areas: [...new Set(args.areas)],
        history: args.history,
        motivator: args.motivator,
        heardFrom: args.heardFrom,
        completedAt: Date.now(),
      },
    });
    return null;
  },
});

/**
 * Deletes the signed-in user's account and everything in it
 * (`accountDeletion.ts`). Armed stakes are let go; a charge in flight refuses
 * it. The Stripe customer goes too, and its saved cards with it; Stripe keeps
 * its own record of past charges, including a declined one still owed. The
 * client then deletes the Clerk user and signs out.
 *
 * Safe to call again after a failure: the `users` row goes last, so a retry
 * picks up where the last run stopped.
 */
export const deleteAccount = authedAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const userId = ctx.user._id;
    const customerId: string | null = await ctx.runMutation(internal.accountDeletion.prepare, {
      userId,
    });

    if (customerId !== null) {
      try {
        await stripeClient().customers.del(customerId);
      } catch (error: unknown) {
        // Already deleted by an earlier run that didn't finish.
        if (!(error instanceof Stripe.errors.StripeError && error.code === 'resource_missing')) {
          throw error;
        }
      }
    }

    for (;;) {
      const { done }: { done: boolean } = await ctx.runMutation(
        internal.accountDeletion.purgeBatch,
        { userId },
      );
      if (done) return null;
    }
  },
});
