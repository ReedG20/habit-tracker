import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { env, internalAction, internalMutation, type MutationCtx } from './_generated/server';
import { authedMutation } from './lib/customFunctions';
import { deliver, grantedTokens, touchReminders, type OutgoingPush } from './lib/notify';
import { eventCopy } from './lib/reminderCopy';

/**
 * Devices and delivery. The app registers its Expo push token with whatever
 * permission iOS reports; `send` hands pushes to the Expo Push Service and
 * forgets a device only when Expo says it's gone for good.
 *
 * Delivery is off unless `PUSH_DELIVERY=on` (see `convex.config.ts`), so
 * the per-worktree dev deployments never push to a real phone.
 */

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo takes at most 100 pushes per request and 1000 receipt ids per lookup. */
const SEND_CHUNK = 100;
const RECEIPT_CHUNK = 1000;
/** Receipts are ready roughly this long after a send. */
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_TOKENS_PER_USER = 10;

const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

const permissionValidator = v.union(
  v.literal('granted'),
  v.literal('provisional'),
  v.literal('denied'),
  v.literal('undetermined'),
);

/** One push to one device, in the Expo Push Service's own field names. */
export const outgoingPushValidator = v.object({
  to: v.string(),
  title: v.string(),
  body: v.string(),
  /** What the app needs when it's tapped: `kind`, and the screen to open. */
  data: v.object({
    kind: v.string(),
    url: v.string(),
    final: v.optional(v.boolean()),
    /** A stake that came due: builds with the loss screen open it instead of `url`. */
    lossStakeId: v.optional(v.string()),
  }),
  /** Same id replaces the earlier push in Notification Center. */
  collapseId: v.optional(v.string()),
  threadId: v.optional(v.string()),
  interruptionLevel: v.optional(
    v.union(v.literal('passive'), v.literal('active'), v.literal('time-sensitive')),
  ),
  sound: v.optional(v.literal('default')),
  /** Unix seconds after which APNs drops it rather than deliver it late. */
  expiration: v.optional(v.number()),
  relevanceScore: v.optional(v.number()),
});

const rateLimiter = new RateLimiter(components.rateLimiter, {
  testPush: { kind: 'token bucket', rate: 3, period: MINUTE, capacity: 3 },
});

/**
 * Records this device for the signed-in user. A token last used by someone
 * else moves to this user, so a shared phone only ever hears about whoever is
 * signed in. Registering a device that can now show pushes re-plans reminders,
 * which is also how existing users are picked up after updating the app.
 */
export const register = authedMutation({
  args: { token: v.string(), permission: permissionValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (!TOKEN_PATTERN.test(args.token)) {
      throw new Error('Not an Expo push token');
    }

    const now = Date.now();
    const existing = await ctx.db
      .query('pushTokens')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique();

    let changed = true;
    if (existing === null) {
      await ctx.db.insert('pushTokens', {
        userId: ctx.user._id,
        token: args.token,
        permission: args.permission,
        updatedAt: now,
      });
      await pruneTokens(ctx, ctx.user._id);
    } else if (existing.userId !== ctx.user._id || existing.permission !== args.permission) {
      await ctx.db.patch('pushTokens', existing._id, {
        userId: ctx.user._id,
        permission: args.permission,
        updatedAt: now,
      });
    } else {
      changed = false;
    }

    const state = await ctx.db
      .query('reminderState')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .unique();
    if (changed || state === null) {
      await touchReminders(ctx, ctx.user._id);
    }
    return null;
  },
});

/** Keeps the newest devices; phones get replaced, and old rows would pile up. */
async function pruneTokens(ctx: MutationCtx, userId: Id<'users'>): Promise<void> {
  const rows = await ctx.db
    .query('pushTokens')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(MAX_TOKENS_PER_USER + 5);
  const oldest = rows.sort((a, b) => b.updatedAt - a.updatedAt).slice(MAX_TOKENS_PER_USER);
  for (const row of oldest) {
    await ctx.db.delete('pushTokens', row._id);
  }
}

/** Called just before signing out, so the next person on this phone hears nothing of it. */
export const unregister = authedMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const existing = await ctx.db
      .query('pushTokens')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .unique();
    if (existing !== null && existing.userId === ctx.user._id) {
      await ctx.db.delete('pushTokens', existing._id);
    }
    return null;
  },
});

/** The Reminders screen's "Send a test". Returns how many devices it went to. */
export const sendTest = authedMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    await rateLimiter.limit(ctx, 'testPush', { key: ctx.user._id, throws: true });
    const tokens = await grantedTokens(ctx, ctx.user._id);
    await deliver(
      ctx,
      ctx.user._id,
      [
        {
          ...eventCopy({ kind: 'test' }),
          data: { kind: 'test', url: '/me/reminders' },
          collapseId: 'test',
          interruptionLevel: 'active',
          sound: 'default',
          expiration: Math.floor(Date.now() / 1000) + 10 * 60,
        },
      ],
      tokens,
    );
    return tokens.length;
  },
});

type Ticket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

type Receipt =
  { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (env.EXPO_ACCESS_TOKEN !== undefined) {
    headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
  }
  return headers;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Hands pushes to Expo. Network trouble and Expo outages are retried a couple
 * of times, but never past a push's expiration: a late "90 min left" is worse
 * than none. A retry can in rare cases deliver twice; the collapse id makes the
 * second replace the first. A device is forgotten only on `DeviceNotRegistered`,
 * never on a credentials error, which would otherwise wipe every token at once.
 */
export const send = internalAction({
  args: { messages: v.array(outgoingPushValidator), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const nowSeconds = Date.now() / 1000;
    const live = args.messages.filter(
      (message) => message.expiration === undefined || message.expiration > nowSeconds,
    );
    if (live.length === 0) return null;

    if (env.PUSH_DELIVERY !== 'on') {
      console.log(
        `Push delivery is off here; would have sent ${live.length}:`,
        live.map((message) => `${message.title} / ${message.body}`),
      );
      return null;
    }

    const retry: OutgoingPush[] = [];
    const gone: string[] = [];
    const receipts: { id: string; token: string }[] = [];

    for (const batch of chunk(live, SEND_CHUNK)) {
      let response: Response;
      try {
        response = await fetch(EXPO_SEND_URL, {
          method: 'POST',
          headers: expoHeaders(),
          body: JSON.stringify(batch),
        });
      } catch (error: unknown) {
        console.warn('Expo push request failed', error);
        retry.push(...batch);
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        console.warn('Expo push is unavailable', response.status);
        retry.push(...batch);
        continue;
      }
      if (!response.ok) {
        console.error('Expo push refused the request', response.status, await response.text());
        continue;
      }

      const { data } = (await response.json()) as { data?: Ticket[] };
      (data ?? []).forEach((ticket, index) => {
        const token = batch[index]?.to;
        if (token === undefined) return;
        if (ticket.status === 'ok') {
          receipts.push({ id: ticket.id, token });
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          gone.push(token);
        } else {
          console.warn('Expo push ticket error', ticket.details?.error, ticket.message);
        }
      });
    }

    if (gone.length > 0) {
      await ctx.runMutation(internal.push.removeTokens, { tokens: gone });
    }
    if (receipts.length > 0) {
      await ctx.scheduler.runAfter(RECEIPT_DELAY_MS, internal.push.checkReceipts, { receipts });
    }
    if (retry.length > 0 && args.attempt + 1 < MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(30_000 * (args.attempt + 1), internal.push.send, {
        messages: retry,
        attempt: args.attempt + 1,
      });
    }
    return null;
  },
});

/** APNs can report a device gone only after the ticket came back fine. */
export const checkReceipts = internalAction({
  args: { receipts: v.array(v.object({ id: v.string(), token: v.string() })) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const tokenById = new Map(args.receipts.map((receipt) => [receipt.id, receipt.token]));
    const gone: string[] = [];

    for (const ids of chunk([...tokenById.keys()], RECEIPT_CHUNK)) {
      let response: Response;
      try {
        response = await fetch(EXPO_RECEIPTS_URL, {
          method: 'POST',
          headers: expoHeaders(),
          body: JSON.stringify({ ids }),
        });
      } catch (error: unknown) {
        console.warn('Expo receipt request failed', error);
        continue;
      }
      if (!response.ok) {
        console.warn('Expo receipts unavailable', response.status);
        continue;
      }

      const { data } = (await response.json()) as { data?: Record<string, Receipt> };
      for (const [id, receipt] of Object.entries(data ?? {})) {
        if (receipt.status !== 'error') continue;
        if (receipt.details?.error === 'DeviceNotRegistered') {
          const token = tokenById.get(id);
          if (token !== undefined) gone.push(token);
        } else {
          console.warn('Expo push receipt error', receipt.details?.error, receipt.message);
        }
      }
    }

    if (gone.length > 0) {
      await ctx.runMutation(internal.push.removeTokens, { tokens: gone });
    }
    return null;
  },
});

export const removeTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    for (const token of new Set(args.tokens)) {
      const row = await ctx.db
        .query('pushTokens')
        .withIndex('by_token', (q) => q.eq('token', token))
        .unique();
      if (row !== null) await ctx.db.delete('pushTokens', row._id);
    }
    return null;
  },
});
