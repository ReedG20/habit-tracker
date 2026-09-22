import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { isSubscriptionActive } from './lib/entitlements';
import type { SubscriptionEvent, WebhookEvent } from './revenuecat';
import { setup, signIn, type Harness } from './test.helpers';

const T0 = 1_758_400_000_000;
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** A Pro trial purchase by `userId`, overridable per test. */
function subscriptionEvent(
  userId: Id<'users'>,
  overrides: Partial<SubscriptionEvent> = {},
): SubscriptionEvent {
  return {
    type: 'INITIAL_PURCHASE',
    appUserId: userId,
    aliases: [],
    eventTimestampMs: T0,
    environment: 'SANDBOX',
    entitlementIds: ['ante_pro'],
    productId: 'ante_pro_annual',
    periodType: 'TRIAL',
    store: 'APP_STORE',
    purchasedAtMs: T0,
    expirationAtMs: T0 + WEEK,
    ...overrides,
  };
}

async function deliver(t: Harness, eventId: string, event: WebhookEvent) {
  await t.mutation(internal.revenuecat.handleEvent, { eventId, event });
}

async function subscriptionOf(t: Harness, userId: Id<'users'>) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
  });
}

describe('revenuecat.handleEvent', () => {
  test('INITIAL_PURCHASE of a trial creates an active trial row', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');

    await deliver(t, 'evt_1', subscriptionEvent(alice.userId));

    const row = await subscriptionOf(t, alice.userId);
    expect(row).toMatchObject({
      status: 'trial',
      willRenew: true,
      productId: 'ante_pro_annual',
      expiresAt: T0 + WEEK,
      environment: 'SANDBOX',
      lastEventAt: T0,
      lastEventType: 'INITIAL_PURCHASE',
    });
    expect(isSubscriptionActive(row!, T0 + 1)).toBe(true);
  });

  test('CANCELLATION keeps access until the existing expiry', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await deliver(t, 'evt_1', subscriptionEvent(alice.userId));

    await deliver(
      t,
      'evt_2',
      subscriptionEvent(alice.userId, {
        type: 'CANCELLATION',
        eventTimestampMs: T0 + 1000,
        cancelReason: 'UNSUBSCRIBE',
      }),
    );

    const row = await subscriptionOf(t, alice.userId);
    expect(row).toMatchObject({
      status: 'cancelled',
      willRenew: false,
      cancelReason: 'UNSUBSCRIBE',
      expiresAt: T0 + WEEK,
    });
    expect(isSubscriptionActive(row!, T0 + WEEK - 1)).toBe(true);
    expect(isSubscriptionActive(row!, T0 + WEEK + 1)).toBe(false);
  });

  test('EXPIRATION ends access', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await deliver(t, 'evt_1', subscriptionEvent(alice.userId));

    await deliver(
      t,
      'evt_2',
      subscriptionEvent(alice.userId, {
        type: 'EXPIRATION',
        eventTimestampMs: T0 + WEEK,
        expirationAtMs: T0 + WEEK,
        expirationReason: 'UNSUBSCRIBE',
      }),
    );

    const row = await subscriptionOf(t, alice.userId);
    expect(row).toMatchObject({ status: 'expired', expirationReason: 'UNSUBSCRIBE' });
    expect(isSubscriptionActive(row!, T0 + WEEK + 1)).toBe(false);
  });

  test('RENEWAL after a cancellation means the user re-subscribed', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await deliver(t, 'evt_1', subscriptionEvent(alice.userId));
    await deliver(
      t,
      'evt_2',
      subscriptionEvent(alice.userId, { type: 'CANCELLATION', eventTimestampMs: T0 + 1000 }),
    );

    await deliver(
      t,
      'evt_3',
      subscriptionEvent(alice.userId, {
        type: 'RENEWAL',
        eventTimestampMs: T0 + WEEK,
        periodType: 'NORMAL',
        expirationAtMs: T0 + 2 * WEEK,
      }),
    );

    const row = await subscriptionOf(t, alice.userId);
    expect(row).toMatchObject({ status: 'active', willRenew: true, expiresAt: T0 + 2 * WEEK });
    expect(row?.cancelReason).toBeUndefined();
  });

  test('an older event delivered late does not overwrite a newer one', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await deliver(
      t,
      'evt_2',
      subscriptionEvent(alice.userId, { type: 'CANCELLATION', eventTimestampMs: T0 + 1000 }),
    );

    await deliver(t, 'evt_1', subscriptionEvent(alice.userId));

    expect(await subscriptionOf(t, alice.userId)).toMatchObject({
      status: 'cancelled',
      lastEventAt: T0 + 1000,
    });
  });

  test('a redelivered event is a no-op', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const event = subscriptionEvent(alice.userId);
    await deliver(t, 'evt_1', event);
    // Rewind by hand: without dedupe the redelivery would restore the trial.
    const row = await subscriptionOf(t, alice.userId);
    await t.run(async (ctx) => {
      await ctx.db.patch('subscriptions', row!._id, { status: 'expired' });
    });

    await deliver(t, 'evt_1', event);

    expect(await subscriptionOf(t, alice.userId)).toMatchObject({ status: 'expired' });
    const seen = await t.run(async (ctx) => await ctx.db.query('revenuecatEvents').collect());
    expect(seen).toHaveLength(1);
  });

  test('an unknown app user id is ignored without throwing', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');

    await deliver(t, 'evt_1', subscriptionEvent(alice.userId, { appUserId: 'nope' }));

    expect(await subscriptionOf(t, alice.userId)).toBeNull();
  });

  test('resolves the user through the aliases when the primary id is anonymous', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');

    await deliver(
      t,
      'evt_1',
      subscriptionEvent(alice.userId, {
        appUserId: '$RCAnonymousID:abc',
        aliases: ['$RCAnonymousID:abc', alice.userId],
      }),
    );

    expect(await subscriptionOf(t, alice.userId)).toMatchObject({
      status: 'trial',
      rcAppUserId: '$RCAnonymousID:abc',
    });
  });

  test('TRANSFER moves the row to the receiving user', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    await deliver(t, 'evt_1', subscriptionEvent(alice.userId));
    await deliver(
      t,
      'evt_2',
      subscriptionEvent(bob.userId, { type: 'EXPIRATION', eventTimestampMs: T0 - WEEK }),
    );

    await deliver(t, 'evt_3', {
      type: 'TRANSFER',
      appUserId: bob.userId,
      aliases: [],
      eventTimestampMs: T0 + 1000,
      environment: 'SANDBOX',
      transferredFrom: [alice.userId],
      transferredTo: [bob.userId],
    });

    expect(await subscriptionOf(t, alice.userId)).toBeNull();
    expect(await subscriptionOf(t, bob.userId)).toMatchObject({
      status: 'trial',
      lastEventType: 'TRANSFER',
    });
    const rows = await t.run(async (ctx) => await ctx.db.query('subscriptions').collect());
    expect(rows).toHaveLength(1);
  });

  test('an event for another entitlement is ignored', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');

    await deliver(t, 'evt_1', subscriptionEvent(alice.userId, { entitlementIds: [] }));

    expect(await subscriptionOf(t, alice.userId)).toBeNull();
  });

  test('TEST is recorded and otherwise ignored', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');

    await deliver(t, 'evt_1', {
      type: 'TEST',
      appUserId: alice.userId,
      aliases: [],
      eventTimestampMs: T0,
      environment: 'SANDBOX',
    });

    expect(await subscriptionOf(t, alice.userId)).toBeNull();
    const seen = await t.run(async (ctx) => await ctx.db.query('revenuecatEvents').collect());
    expect(seen).toMatchObject([{ eventId: 'evt_1', type: 'TEST' }]);
  });
});
