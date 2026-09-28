import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { parseProEntitlement } from './subscriptions';
import { grantPro, setup, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Everyone here lives in UTC, so local midnight is 00:00Z.
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

async function signIn(t: Harness, tokenIdentifier: string, pro = true) {
  const as = t.withIdentity({ tokenIdentifier, name: tokenIdentifier });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  if (pro) await grantPro(t, userId);
  return { as, userId };
}

async function runCheck(t: Harness, day: string, hour = 1) {
  vi.setSystemTime(at(day, hour));
  await t.mutation(internal.lockouts.checkAll, {});
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('making a commitment needs Pro', () => {
  test('habits and goals are refused without it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice', false);

    await expect(alice.as.mutation(api.habits.create, { title: 'Run' })).rejects.toThrow(
      'Ante Pro is required',
    );
    await expect(
      alice.as.mutation(api.goals.create, { title: 'Ship it', dueAt: Date.now() + 86_400_000 }),
    ).rejects.toThrow('Ante Pro is required');
  });

  test('a lapsed habit takes no check-ins', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await grantPro(t, alice.userId, Date.now() - 1);

    const photoId = await t.run(
      async (ctx) => await ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' })),
    );
    await expect(
      alice.as.mutation(api.verifications.submit, { habitId, day: '2026-09-21', photoId }),
    ).rejects.toThrow('Ante Pro is required');
  });
});

describe('habits pause when Pro ends', () => {
  test('days missed while Pro was active still lock', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    // Pro covered all of Tuesday the 22nd and ended Wednesday afternoon.
    await grantPro(t, alice.userId, at('2026-09-23', 15).getTime());

    await runCheck(t, '2026-09-26');
    const lock = await alice.as.query(api.lockouts.current, {});
    expect(lock?.misses).toEqual([expect.objectContaining({ period: '2026-09-22' })]);
  });

  test('nothing after Pro ended is judged', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    // Monday is free, and Pro ended as Tuesday began.
    await grantPro(t, alice.userId, at('2026-09-22', 0).getTime());

    await runCheck(t, '2026-09-26');
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
  });

  test('someone who never had Pro is never locked', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    await t.run(async (ctx) => {
      const rows = await ctx.db.query('subscriptions').collect();
      for (const row of rows) await ctx.db.delete('subscriptions', row._id);
    });

    await runCheck(t, '2026-09-26');
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
  });

  test('resubscribing makes that day free, and the next one counts', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    await grantPro(t, alice.userId, at('2026-09-22', 0).getTime());
    await runCheck(t, '2026-09-25');

    vi.setSystemTime(at('2026-09-25', 10));
    await grantPro(t, alice.userId);
    await runCheck(t, '2026-09-26');
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();

    await runCheck(t, '2026-09-27');
    const lock = await alice.as.query(api.lockouts.current, {});
    expect(lock?.misses).toEqual([expect.objectContaining({ period: '2026-09-26' })]);
  });
});

describe('subscriptions.sync', () => {
  const body = (expires: string, periodType = 'trial', unsubscribed: string | null = null) => ({
    subscriber: {
      entitlements: {
        ante_pro: {
          expires_date: expires,
          product_identifier: 'ante_pro_annual',
          purchase_date: '2026-09-21T10:00:00Z',
        },
      },
      subscriptions: {
        ante_pro_annual: {
          period_type: periodType,
          store: 'app_store',
          is_sandbox: true,
          unsubscribe_detected_at: unsubscribed,
          billing_issues_detected_at: null,
        },
      },
    },
  });

  test('reads a live trial', () => {
    expect(parseProEntitlement(body('2026-09-28T10:00:00Z'), Date.now())).toEqual({
      status: 'trial',
      productId: 'ante_pro_annual',
      store: 'APP_STORE',
      periodType: 'TRIAL',
      environment: 'SANDBOX',
      purchasedAt: Date.parse('2026-09-21T10:00:00Z'),
      expiresAt: Date.parse('2026-09-28T10:00:00Z'),
      willRenew: true,
    });
  });

  test('a lapsed entitlement or none at all is nothing', () => {
    expect(parseProEntitlement(body('2026-09-20T10:00:00Z'), Date.now())).toBeNull();
    expect(parseProEntitlement({ subscriber: { entitlements: {} } }, Date.now())).toBeNull();
    expect(parseProEntitlement('nonsense', Date.now())).toBeNull();
  });

  test('fills in a missing row, but never overwrites a live one', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice', false);
    const synced = parseProEntitlement(body('2026-09-28T10:00:00Z'), Date.now())!;

    await t.mutation(internal.subscriptions.applySynced, { userId: alice.userId, synced });
    const row = await alice.as.query(api.subscriptions.current, {});
    expect(row).toMatchObject({ status: 'trial', lastEventAt: synced.purchasedAt });

    await t.mutation(internal.subscriptions.applySynced, {
      userId: alice.userId,
      synced: { ...synced, productId: 'ante_pro_monthly' },
    });
    expect(await alice.as.query(api.subscriptions.current, {})).toMatchObject({
      productId: 'ante_pro_annual',
    });
  });
});

describe('developer tools', () => {
  test('granting and ending Pro need dev overrides', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice', false);
    await expect(alice.as.mutation(api.subscriptions.devGrantPro, {})).rejects.toThrow(
      'Developer overrides are off',
    );
    await expect(alice.as.mutation(api.subscriptions.devEndPro, {})).rejects.toThrow(
      'Developer overrides are off',
    );

    vi.stubEnv('ANTE_DEV_OVERRIDES', '1');
    await alice.as.mutation(api.subscriptions.devGrantPro, {});
    await alice.as.mutation(api.habits.create, { title: 'Run' });

    await alice.as.mutation(api.subscriptions.devEndPro, {});
    await expect(alice.as.mutation(api.habits.create, { title: 'Read' })).rejects.toThrow(
      'Ante Pro is required',
    );
  });
});
