import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { PRO_ENTITLEMENT } from './revenuecat';
import { paymentIntent, SECRET_KEY, signedWebhook, WEBHOOK_SECRET } from './stripeFake.helpers';
import { setup, signIn, type Harness } from './test.helpers';

/**
 * The webhook endpoints themselves (`http.ts`): who gets in, what a malformed
 * delivery gets back (a 4xx stops the sender retrying), and that a redelivery
 * is applied once.
 */

const RC_AUTH = 'Bearer rc-test-secret';
const NOW = Date.UTC(2026, 9, 1, 12);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv('STRIPE_SECRET_KEY', SECRET_KEY);
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
  vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', RC_AUTH);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function stripeEvents(t: Harness) {
  return await t.run(async (ctx) => await ctx.db.query('stripeEvents').collect());
}

async function chargingStake(t: Harness, userId: Id<'users'>): Promise<Id<'stakes'>> {
  return await t.run(async (ctx) => {
    const habitId = await ctx.db.insert('habits', { userId, title: 'Run', order: 0 });
    return await ctx.db.insert('stakes', {
      kind: 'money',
      userId,
      habitId,
      title: 'Run',
      createdAt: 0,
      lostAt: NOW - 1000,
      amountCents: 2500,
      stripeCustomerId: 'cus_test',
      stripePaymentMethodId: 'pm_test',
      status: 'charging',
    });
  });
}

function succeeded(eventId: string, stakeId: Id<'stakes'>) {
  return {
    id: eventId,
    type: 'payment_intent.succeeded',
    data: { object: paymentIntent('pi_1', 'succeeded', { metadata: { stakeId } }) },
  };
}

describe('POST /stripe/webhook', () => {
  test('without a signature is a 400', async () => {
    const t = setup();
    const response = await t.fetch('/stripe/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' }),
    });
    expect(response.status).toBe(400);
    expect(await stripeEvents(t)).toEqual([]);
  });

  test('signed with another secret is a 400 and changes nothing', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await chargingStake(t, alice.userId);

    const response = await t.fetch(
      '/stripe/webhook',
      await signedWebhook(succeeded('evt_forged', stakeId), 'whsec_someone_else'),
    );

    expect(response.status).toBe(400);
    expect(await stripeEvents(t)).toEqual([]);
    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'charging',
    });
  });

  test('a body changed after signing is a 400', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await chargingStake(t, alice.userId);
    const genuine = await signedWebhook(succeeded('evt_1', stakeId));

    const tampered = String(genuine.body).replace('"pi_1"', '"pi_2"');
    const response = await t.fetch('/stripe/webhook', { ...genuine, body: tampered });

    expect(response.status).toBe(400);
    expect(await stripeEvents(t)).toEqual([]);
  });

  test('a signature older than Stripe’s tolerance is a 400 (no replays)', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await chargingStake(t, alice.userId);
    const payload = JSON.stringify({ object: 'event', ...succeeded('evt_old', stakeId) });
    const header = await new Stripe(SECRET_KEY).webhooks.generateTestHeaderStringAsync({
      payload,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(NOW / 1000) - 10 * 60,
      cryptoProvider: Stripe.createSubtleCryptoProvider(),
    });

    const response = await t.fetch('/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': header },
      body: payload,
    });

    expect(response.status).toBe(400);
  });

  test('a redelivered event id is applied once', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await chargingStake(t, alice.userId);

    const first = await t.fetch(
      '/stripe/webhook',
      await signedWebhook(succeeded('evt_1', stakeId)),
    );
    expect(first.status).toBe(200);
    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'charged',
    });

    // Rewind by hand: if the id weren't deduped, the redelivery would settle it again.
    await t.run(async (ctx) => await ctx.db.patch('stakes', stakeId, { status: 'charging' }));
    const again = await t.fetch(
      '/stripe/webhook',
      await signedWebhook(succeeded('evt_1', stakeId)),
    );

    expect(again.status).toBe(200);
    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'charging',
    });
    expect(await stripeEvents(t)).toMatchObject([
      { eventId: 'evt_1', type: 'payment_intent.succeeded' },
    ]);
  });

  test('an event type nobody handles is acknowledged and not recorded', async () => {
    const t = setup();
    const response = await t.fetch(
      '/stripe/webhook',
      await signedWebhook({
        id: 'evt_customer',
        type: 'customer.created',
        data: { object: { id: 'cus_1', object: 'customer' } },
      }),
    );
    expect(response.status).toBe(200);
    expect(await stripeEvents(t)).toEqual([]);
  });
});

describe('POST /revenuecat/webhook', () => {
  function purchase(eventId: string, appUserId: string) {
    return {
      api_version: '1.0',
      event: {
        id: eventId,
        type: 'INITIAL_PURCHASE',
        app_user_id: appUserId,
        aliases: [appUserId],
        event_timestamp_ms: NOW,
        environment: 'SANDBOX',
        entitlement_ids: [PRO_ENTITLEMENT],
        product_id: 'ante_pro_monthly',
        period_type: 'NORMAL',
        store: 'APP_STORE',
        purchased_at_ms: NOW,
        expiration_at_ms: NOW + 30 * 24 * 60 * 60 * 1000,
        transaction_id: `tx_${eventId}`,
      },
    };
  }

  async function post(t: Harness, body: string, authorization?: string) {
    return await t.fetch('/revenuecat/webhook', {
      method: 'POST',
      headers: authorization === undefined ? {} : { Authorization: authorization },
      body,
    });
  }

  async function rcEvents(t: Harness) {
    return await t.run(async (ctx) => await ctx.db.query('revenuecatEvents').collect());
  }

  test('a wrong or missing Authorization header is a 401', async () => {
    const t = setup();
    const body = JSON.stringify(purchase('rc_1', 'nobody'));

    expect((await post(t, body, 'Bearer wrong')).status).toBe(401);
    expect((await post(t, body)).status).toBe(401);
    // Close isn't enough: the header is compared whole.
    expect((await post(t, body, RC_AUTH.slice(0, -1))).status).toBe(401);
    expect((await post(t, body, RC_AUTH.replace('Bearer ', ''))).status).toBe(401);
    expect(await rcEvents(t)).toEqual([]);
  });

  test('with the secret unset on the deployment, nothing gets in', async () => {
    vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', undefined);
    const t = setup();
    const body = JSON.stringify(purchase('rc_1', 'nobody'));

    expect((await post(t, body)).status).toBe(401);
    expect((await post(t, body, '')).status).toBe(401);
    expect((await post(t, body, 'undefined')).status).toBe(401);
  });

  test('a body that isn’t JSON, or lacks the required fields, is a 400', async () => {
    const t = setup();

    expect((await post(t, '{not json', RC_AUTH)).status).toBe(400);
    expect((await post(t, JSON.stringify([]), RC_AUTH)).status).toBe(400);
    expect((await post(t, JSON.stringify({ event: 'nope' }), RC_AUTH)).status).toBe(400);
    const { event } = purchase('rc_1', 'nobody');
    const { environment: _environment, ...noEnvironment } = event;
    expect((await post(t, JSON.stringify({ event: noEnvironment }), RC_AUTH)).status).toBe(400);
    expect(
      (await post(t, JSON.stringify({ event: { ...event, event_timestamp_ms: 'soon' } }), RC_AUTH))
        .status,
    ).toBe(400);
    expect(await rcEvents(t)).toEqual([]);
  });

  test('an event type nobody handles is acknowledged and not recorded', async () => {
    const t = setup();
    const { event } = purchase('rc_1', 'nobody');
    const response = await post(
      t,
      JSON.stringify({ event: { ...event, type: 'SOMETHING_NEW' } }),
      RC_AUTH,
    );
    expect(response.status).toBe(200);
    expect(await rcEvents(t)).toEqual([]);
  });

  test('a purchase grants Pro, and its redelivery is applied once', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice', { pro: false });
    const body = JSON.stringify(purchase('rc_1', alice.userId));

    expect((await post(t, body, RC_AUTH)).status).toBe(200);
    expect((await post(t, body, RC_AUTH)).status).toBe(200);

    expect(await rcEvents(t)).toMatchObject([{ eventId: 'rc_1', type: 'INITIAL_PURCHASE' }]);
    const subscriptions = await t.run(async (ctx) => await ctx.db.query('subscriptions').collect());
    expect(subscriptions).toMatchObject([
      { userId: alice.userId, productId: 'ante_pro_monthly', lastEventType: 'INITIAL_PURCHASE' },
    ]);
    expect(await t.query(internal.subscriptions.hasPro, { userId: alice.userId, now: NOW })).toBe(
      true,
    );
  });
});
