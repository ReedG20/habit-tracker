/// <reference types="vite/client" />
// Multi-dot filename on purpose: the Convex bundler skips those, and this file
// must never be deployed as a function module (`import.meta.glob` is Vite-only).
import { convexTest, type TestConvex } from 'convex-test';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

export type Harness = TestConvex<typeof schema>;

export function setup(): Harness {
  return convexTest(schema, modules);
}

/**
 * A signed-in client for `tokenIdentifier`, with its `users` row already
 * stored. Subscribed to Pro unless `pro: false`, since making a commitment needs it.
 */
export async function signIn(
  t: Harness,
  tokenIdentifier: string,
  { pro = true }: { pro?: boolean } = {},
) {
  const as = t.withIdentity({ tokenIdentifier, name: tokenIdentifier });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, {});
  if (pro) await grantPro(t, userId);
  return { as, userId };
}

/** Far enough out that fake timers never reach it. */
export const FOREVER = Date.UTC(2100, 0, 1);

/** Gives `userId` a Pro subscription row that expires at `expiresAt`, replacing any other. */
export async function grantPro(t: Harness, userId: Id<'users'>, expiresAt: number = FOREVER) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (existing !== null) await ctx.db.delete('subscriptions', existing._id);
    await ctx.db.insert('subscriptions', {
      userId,
      status: 'active',
      productId: 'ante_pro_monthly',
      store: 'APP_STORE',
      periodType: 'NORMAL',
      environment: 'SANDBOX',
      purchasedAt: 0,
      expiresAt,
      willRenew: true,
      rcAppUserId: userId,
      lastEventAt: 0,
      lastEventType: 'INITIAL_PURCHASE',
      updatedAt: 0,
    });
  });
}

export const TODAY = '2026-09-21';
