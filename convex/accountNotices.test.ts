import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { SubscriptionEvent } from './revenuecat';
import { grantPro, setup, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Everyone here lives in UTC, so local midnight is 00:00Z.
const at = (value: string) => Date.parse(value);
const TOKEN = 'ExponentPushToken[alice-phone]';

type Sent = { to: string; title: string; body: string; collapseId?: string };
let sent: Sent[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21T09:00:00Z'));
  vi.stubEnv('PUSH_DELIVERY', 'on');
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/push/send')) {
        const batch = JSON.parse(String(init?.body)) as Sent[];
        sent.push(...batch);
        const data = batch.map((_, index) => ({ status: 'ok', id: `ticket-${index}` }));
        return new Response(JSON.stringify({ data }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A user with a phone that takes pushes, on Pro renewing at `renewsAt` unless `pro` is false. */
async function signIn(t: Harness, { pro = true, renewsAt = at('2026-10-15T12:00:00Z') } = {}) {
  const as = t.withIdentity({ tokenIdentifier: 'alice', name: 'alice' });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  if (pro) await grantPro(t, userId, renewsAt);
  await as.mutation(api.push.register, { token: TOKEN, permission: 'granted' });
  return { as, userId };
}

/** Runs every scheduled function due up to `until`, one wave at a time, in order. */
async function runUntil(t: Harness, until: string) {
  const target = at(until);
  for (let wave = 0; wave < 200; wave += 1) {
    const next = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      return jobs
        .filter((job) => job.state.kind === 'pending')
        .map((job) => job.scheduledTime)
        .sort((a, b) => a - b)[0];
    });
    if (next === undefined || next > target) break;
    vi.advanceTimersByTime(Math.max(0, next - Date.now()));
    await t.finishInProgressScheduledFunctions();
  }
  vi.advanceTimersByTime(Math.max(0, target - Date.now()));
}

const notices = (prefix: 'lock' | 'trial') =>
  sent.filter((push) => push.collapseId?.startsWith(`${prefix}:`));

async function lock(t: Harness, as: Awaited<ReturnType<typeof signIn>>['as']) {
  vi.stubEnv('ANTE_DEV_OVERRIDES', '1');
  await as.mutation(api.lockouts.devLock, {});
}

describe('still locked, still subscribed', () => {
  test('a missed habit locks, and three days on, at 10 AM, one notice names the renewal', async () => {
    const t = setup();
    const alice = await signIn(t);
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    // Tuesday is missed; the check just after midnight on Wednesday locks.
    vi.setSystemTime(at('2026-09-23T01:00:00Z'));
    await t.mutation(internal.lockouts.checkAll, {});
    expect(await alice.as.query(api.lockouts.current, {})).not.toBeNull();

    await runUntil(t, '2026-09-26T09:59:00Z');
    expect(notices('lock')).toEqual([]);

    await runUntil(t, '2026-09-26T10:01:00Z');
    expect(notices('lock')).toEqual([
      expect.objectContaining({
        title: 'Ante is still locked',
        body: 'Your Ante Pro subscription is still active and renews Oct 15. Pay the fee to get back in, or manage your subscription.',
      }),
    ]);
  });

  test('paying the fee first means no notice', async () => {
    const t = setup();
    const alice = await signIn(t);
    await lock(t, alice.as);
    await t.mutation(internal.lockouts.recordReentryPayments, {
      userId: alice.userId,
      payments: [
        {
          transactionId: 'tx_1',
          productId: 'ante_reentry',
          environment: 'SANDBOX',
          purchasedAt: Date.now(),
        },
      ],
    });

    await runUntil(t, '2026-10-01T00:00:00Z');
    expect(notices('lock')).toEqual([]);
  });

  test('a subscription that will not renew is not warned about', async () => {
    const t = setup();
    const alice = await signIn(t);
    await t.run(async (ctx) => {
      const row = await ctx.db.query('subscriptions').first();
      await ctx.db.patch('subscriptions', row!._id, { willRenew: false });
    });
    await lock(t, alice.as);

    await runUntil(t, '2026-10-01T00:00:00Z');
    expect(notices('lock')).toEqual([]);
  });

  test('while the lock goes on, each renewal gets a heads-up two days before', async () => {
    const t = setup();
    // Renews Thursday, Oct 1.
    const alice = await signIn(t, { renewsAt: at('2026-10-01T12:00:00Z') });
    await lock(t, alice.as);

    await runUntil(t, '2026-09-29T10:01:00Z');
    expect(notices('lock').map((push) => push.title)).toEqual([
      'Ante is still locked',
      'Ante Pro renews Thursday',
    ]);

    // It renews, and the webhook moves the date to Sunday, Nov 1.
    await runUntil(t, '2026-10-01T13:00:00Z');
    await grantPro(t, alice.userId, at('2026-11-01T12:00:00Z'));

    await runUntil(t, '2026-10-30T09:00:00Z');
    expect(notices('lock')).toHaveLength(2);
    await runUntil(t, '2026-10-30T10:01:00Z');
    expect(notices('lock').at(-1)?.title).toBe('Ante Pro renews Sunday');
  });
});

describe('trial ending', () => {
  const trialEvent = (
    userId: Id<'users'>,
    overrides: Partial<SubscriptionEvent> = {},
  ): SubscriptionEvent => ({
    type: 'INITIAL_PURCHASE',
    appUserId: userId,
    aliases: [],
    eventTimestampMs: Date.now(),
    environment: 'SANDBOX',
    entitlementIds: ['ante_pro'],
    productId: 'ante_pro_annual',
    periodType: 'TRIAL',
    store: 'APP_STORE',
    purchasedAtMs: at('2026-09-21T09:00:00Z'),
    // Ends Monday, Sep 28.
    expirationAtMs: at('2026-09-28T09:00:00Z'),
    ...overrides,
  });

  async function webhook(t: Harness, id: string, event: SubscriptionEvent) {
    await t.mutation(internal.revenuecat.handleEvent, { eventId: id, event });
  }

  test('a renewing trial gets one heads-up, at 10 AM two days before it ends', async () => {
    const t = setup();
    const alice = await signIn(t, { pro: false });
    await webhook(t, 'evt_1', trialEvent(alice.userId));

    await runUntil(t, '2026-09-26T09:59:00Z');
    expect(notices('trial')).toEqual([]);
    await runUntil(t, '2026-09-28T09:00:00Z');
    expect(notices('trial')).toEqual([
      expect.objectContaining({
        title: 'Your free week ends Monday',
        body: 'Ante Pro renews then. If it’s not for you, cancel in Settings before it does.',
      }),
    ]);
  });

  test('a trial cancelled before then gets nothing', async () => {
    const t = setup();
    const alice = await signIn(t, { pro: false });
    await webhook(t, 'evt_1', trialEvent(alice.userId));
    vi.setSystemTime(Date.now() + 60_000);
    await webhook(t, 'evt_2', trialEvent(alice.userId, { type: 'CANCELLATION' }));

    await runUntil(t, '2026-09-28T09:00:00Z');
    expect(notices('trial')).toEqual([]);
  });

  test('cancelled then restored: scheduled twice, sent once', async () => {
    const t = setup();
    const alice = await signIn(t, { pro: false });
    await webhook(t, 'evt_1', trialEvent(alice.userId));
    vi.setSystemTime(Date.now() + 60_000);
    await webhook(t, 'evt_2', trialEvent(alice.userId, { type: 'CANCELLATION' }));
    vi.setSystemTime(Date.now() + 60_000);
    await webhook(t, 'evt_3', trialEvent(alice.userId, { type: 'UNCANCELLATION' }));

    await runUntil(t, '2026-09-28T09:00:00Z');
    expect(notices('trial')).toHaveLength(1);
  });
});

describe('developer preview', () => {
  test('needs dev overrides, then sends every notice at once', async () => {
    const t = setup();
    const alice = await signIn(t);
    await expect(alice.as.mutation(api.accountNotices.devPreview, {})).rejects.toThrow(
      'Developer overrides are off',
    );

    vi.stubEnv('ANTE_DEV_OVERRIDES', '1');
    await alice.as.mutation(api.accountNotices.devPreview, {});
    await runUntil(t, '2026-09-21T09:01:00Z');
    expect(sent.filter((push) => push.collapseId?.startsWith('preview:'))).toHaveLength(3);
  });
});
