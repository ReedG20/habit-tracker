import { DAY, RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';

import { components } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, query, type MutationCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { notifyFriendGone } from './lib/notify';

/**
 * The friends a user answers to (the "tell a friend" stake). A friend is named
 * once and reused. They can opt out from any email, of this user or of Ante
 * altogether; either way, the stakes they were on go void and the user is
 * asked to pick someone else.
 */

const MAX_NAME_LENGTH = 40;
const MAX_EMAIL_LENGTH = 254;
/** Loose on purpose: the real check is whether Resend can deliver it. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const friendLimiter = new RateLimiter(components.rateLimiter, {
  newFriend: { kind: 'token bucket', rate: 5, period: DAY, capacity: 5 },
  headsUp: { kind: 'token bucket', rate: 10, period: DAY, capacity: 10 },
});

/** A friend picked from the saved list, or someone new. */
export const friendInputValidator = v.union(
  v.object({ friendId: v.id('friends') }),
  v.object({ name: v.string(), email: v.string() }),
);

export type FriendInput = typeof friendInputValidator.type;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function isSuppressed(ctx: MutationCtx, email: string): Promise<boolean> {
  const row = await ctx.db
    .query('emailSuppressions')
    .withIndex('by_email', (q) => q.eq('email', email))
    .first();
  return row !== null;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The friend row a new stake will point at, after every check that could
 * stop an email going out: a valid address that isn't the user's own, that
 * hasn't opted out or bounced, and a bound on how many new people a day.
 */
export async function resolveFriend(
  ctx: MutationCtx,
  user: Doc<'users'>,
  input: FriendInput,
): Promise<Doc<'friends'>> {
  if ('friendId' in input) {
    const friend = await ctx.db.get('friends', input.friendId);
    if (friend === null || friend.userId !== user._id) throw new Error('Friend not found');
    requireReachable(friend);
    return friend;
  }

  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (name.length === 0) throw new Error('Add your friend’s name');
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Keep the name under ${MAX_NAME_LENGTH} characters`);
  }
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new Error('That email address doesn’t look right');
  }
  if (email === normalizeEmail(user.email)) {
    throw new Error('Pick someone other than yourself');
  }
  if (await isSuppressed(ctx, email)) {
    throw new Error(`${name} has asked Ante not to email them`);
  }

  const existing = await ctx.db
    .query('friends')
    .withIndex('by_user_and_email', (q) => q.eq('userId', user._id).eq('email', email))
    .unique();
  if (existing !== null) {
    requireReachable(existing);
    if (existing.name !== name) await ctx.db.patch('friends', existing._id, { name });
    return { ...existing, name };
  }

  const limit = await friendLimiter.limit(ctx, 'newFriend', { key: user._id });
  if (!limit.ok) {
    throw new Error('That’s a lot of new people for one day. Try again tomorrow.');
  }

  const friendId = await ctx.db.insert('friends', {
    userId: user._id,
    name,
    email,
    status: 'active',
    optOutToken: randomToken(),
    createdAt: Date.now(),
  });
  const friend = await ctx.db.get('friends', friendId);
  if (friend === null) throw new Error('Friend not found');
  return friend;
}

function requireReachable(friend: Doc<'friends'>): void {
  if (friend.status === 'opted_out') {
    throw new Error(`${friend.name} opted out of hearing from Ante. Pick someone else.`);
  }
  if (friend.status === 'bounced') {
    throw new Error(`Email to ${friend.name} bounced. Check the address, or pick someone else.`);
  }
}

const friendViewValidator = v.object({
  _id: v.id('friends'),
  name: v.string(),
  email: v.string(),
});

/** Friends the user can pick again, most recent first. */
export const list = query({
  args: {},
  returns: v.array(friendViewValidator),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) return [];
    const rows = await ctx.db
      .query('friends')
      .withIndex('by_user_and_email', (q) => q.eq('userId', user._id))
      .take(100);
    return rows
      .filter((friend) => friend.status === 'active')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ _id, name, email }) => ({ _id, name, email }));
  },
});

/** What the opt-out page shows before anything is changed. */
export const byToken = internalQuery({
  args: { token: v.string() },
  returns: v.union(v.object({ userName: v.string(), status: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const friend = await ctx.db
      .query('friends')
      .withIndex('by_opt_out_token', (q) => q.eq('optOutToken', args.token))
      .unique();
    if (friend === null) return null;
    const user = await ctx.db.get('users', friend.userId);
    return { userName: firstName(user?.name), status: friend.status };
  },
});

/** "Reed" from "Reed Grenager"; something that still reads well when there's no name. */
export function firstName(name: string | undefined): string {
  const first = name?.trim().split(/\s+/)[0] ?? '';
  return first.length > 0 ? first : 'Your friend';
}

/**
 * Stops emails to the friend behind `token`: from this one user, or with
 * `everyone`, from Ante altogether. Either way their armed stakes go void.
 */
export const optOut = internalMutation({
  args: { token: v.string(), everyone: v.boolean() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const friend = await ctx.db
      .query('friends')
      .withIndex('by_opt_out_token', (q) => q.eq('optOutToken', args.token))
      .unique();
    if (friend === null) return false;

    if (!args.everyone) {
      await stopFriend(ctx, friend, 'opted_out');
      return true;
    }

    await suppress(ctx, friend.email, 'opt_out');
    return true;
  },
});

/** Never email `email` again, from anyone, and void every stake it was on. */
export async function suppress(
  ctx: MutationCtx,
  email: string,
  reason: 'opt_out' | 'bounce' | 'complaint',
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!(await isSuppressed(ctx, normalized))) {
    await ctx.db.insert('emailSuppressions', {
      email: normalized,
      reason,
      createdAt: Date.now(),
    });
  }
  const rows = await ctx.db
    .query('friends')
    .withIndex('by_email', (q) => q.eq('email', normalized))
    .take(200);
  for (const friend of rows) {
    await stopFriend(ctx, friend, reason === 'opt_out' ? 'opted_out' : 'bounced');
  }
}

/** Marks the friend unreachable and voids the stakes still waiting on them. */
async function stopFriend(
  ctx: MutationCtx,
  friend: Doc<'friends'>,
  status: 'opted_out' | 'bounced',
): Promise<void> {
  if (friend.status !== 'active') return;
  await ctx.db.patch('friends', friend._id, { status });

  const armed = await ctx.db
    .query('stakes')
    .withIndex('by_user_and_status', (q) => q.eq('userId', friend.userId).eq('status', 'armed'))
    .take(200);
  for (const stake of armed) {
    if (stake.kind !== 'friend' || stake.friendId !== friend._id) continue;
    if (stake.resolveJobId !== undefined) {
      try {
        await ctx.scheduler.cancel(stake.resolveJobId);
      } catch {
        // Already ran.
      }
    }
    await ctx.db.patch('stakes', stake._id, {
      status: 'void',
      releasedAt: Date.now(),
      resolveJobId: undefined,
    });
    await notifyFriendGone(ctx, stake, status);
  }
}
