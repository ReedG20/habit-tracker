import { httpRouter } from 'convex/server';
import type { Infer } from 'convex/values';
import Stripe from 'stripe';

import { internal } from './_generated/api';
import { env, httpAction } from './_generated/server';
import { stripeClient } from './lib/stripe';
import {
  handledEventTypes,
  type HandledEventType,
  type WebhookEvent as RevenueCatEvent,
} from './revenuecat';
import type { webhookEventValidator } from './stripe';

const http = httpRouter();

type WebhookEvent = Infer<typeof webhookEventValidator>;

/**
 * Stripe → `stripe.handleEvent`. Register the endpoint in the Stripe dashboard
 * as `https://<deployment>.convex.site/stripe/webhook` with exactly the event
 * types handled below; locally, `stripe listen --forward-to` that URL.
 *
 * The body is read as text because the signature covers the raw bytes. A bad
 * signature is a 400 (Stripe stops retrying); a failure inside the mutation
 * propagates as a 500 so Stripe retries later.
 */
http.route({
  path: '/stripe/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const signature = req.headers.get('stripe-signature');
    if (signature === null) {
      return new Response('Missing stripe-signature header', { status: 400 });
    }

    let event: Stripe.Event;
    try {
      // Async variant: the Convex runtime has no synchronous crypto.
      event = await stripeClient().webhooks.constructEventAsync(
        await req.text(),
        signature,
        env.STRIPE_WEBHOOK_SECRET,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (error: unknown) {
      console.error('Stripe webhook signature check failed', error);
      return new Response('Invalid signature', { status: 400 });
    }

    const narrowed = narrowEvent(event);
    if (narrowed !== null) {
      await ctx.runMutation(internal.stripe.handleEvent, { eventId: event.id, event: narrowed });
    }

    return new Response(null, { status: 200 });
  }),
});

/** Picks out what the state machine needs; `null` for event types we ignore. */
function narrowEvent(event: Stripe.Event): WebhookEvent | null {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object;
      return {
        type: event.type,
        paymentIntentId: intent.id,
        goalId: intent.metadata.goalId,
      };
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const failure = intent.last_payment_error;
      return {
        type: event.type,
        paymentIntentId: intent.id,
        goalId: intent.metadata.goalId,
        reason: failure?.decline_code ?? failure?.code ?? failure?.message ?? 'Payment failed',
      };
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      return {
        type: event.type,
        paymentIntentId: idOf(charge.payment_intent),
        goalId: charge.metadata.goalId,
        amountRefundedCents: charge.amount_refunded,
        fullyRefunded: charge.refunded,
      };
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object;
      return {
        type: event.type,
        paymentIntentId: idOf(dispute.payment_intent),
        disputeId: dispute.id,
      };
    }
    default:
      return null;
  }
}

/** Stripe fields that are an id, or the expanded object, or absent. */
function idOf(ref: string | { id: string } | null | undefined): string | undefined {
  if (ref === null || ref === undefined) return undefined;
  return typeof ref === 'string' ? ref : ref.id;
}

/**
 * RevenueCat → `revenuecat.handleEvent`. Register two webhooks in the
 * RevenueCat dashboard (Integrations → Webhooks), each with the
 * `REVENUECAT_WEBHOOK_AUTH` value as its Authorization header:
 *   Sandbox events    → https://cool-kiwi-961.convex.site/revenuecat/webhook
 *   Production events → https://whimsical-labrador-585.convex.site/revenuecat/webhook
 *
 * RevenueCat has no signature, only the static header, so it is compared as a
 * whole (a long random token over TLS; timing is not a concern). A bad header
 * is a 401 and a malformed body a 400, both of which stop retries; a failure
 * inside the mutation propagates as a 500 so RevenueCat retries later.
 */
http.route({
  path: '/revenuecat/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (req.headers.get('authorization') !== env.REVENUECAT_WEBHOOK_AUTH) {
      return new Response('Unauthorized', { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const parsed = parseRevenueCatEvent(body);
    if (parsed === 'invalid') {
      return new Response('Invalid event', { status: 400 });
    }
    if (parsed !== null) {
      await ctx.runMutation(internal.revenuecat.handleEvent, parsed);
    }

    return new Response(null, { status: 200 });
  }),
});

/**
 * Narrows the raw payload to what the state machine needs. `null` for event
 * types we do not handle; `'invalid'` when a required field is missing.
 */
function parseRevenueCatEvent(
  body: unknown,
): { eventId: string; event: RevenueCatEvent } | null | 'invalid' {
  if (!isRecord(body) || !isRecord(body.event)) return 'invalid';
  const raw = body.event;

  const eventId = optionalString(raw.id);
  const type = optionalString(raw.type);
  const appUserId = optionalString(raw.app_user_id);
  const eventTimestampMs = optionalNumber(raw.event_timestamp_ms);
  const environment = optionalEnvironment(raw.environment);
  if (
    eventId === undefined ||
    type === undefined ||
    appUserId === undefined ||
    eventTimestampMs === undefined ||
    environment === undefined
  ) {
    return 'invalid';
  }
  if (!isHandledEventType(type)) return null;

  const base = {
    appUserId,
    aliases: stringArray(raw.aliases),
    eventTimestampMs,
    environment,
  };

  switch (type) {
    case 'TEST':
      return { eventId, event: { type, ...base } };
    case 'TRANSFER':
      return {
        eventId,
        event: {
          type,
          ...base,
          transferredFrom: stringArray(raw.transferred_from),
          transferredTo: stringArray(raw.transferred_to),
        },
      };
    default:
      return {
        eventId,
        event: {
          type,
          ...base,
          entitlementIds: stringArray(raw.entitlement_ids),
          productId: optionalString(raw.product_id),
          periodType: optionalString(raw.period_type),
          store: optionalString(raw.store),
          purchasedAtMs: optionalNumber(raw.purchased_at_ms),
          expirationAtMs: optionalNumber(raw.expiration_at_ms),
          cancelReason: optionalString(raw.cancel_reason),
          expirationReason: optionalString(raw.expiration_reason),
          newProductId: optionalString(raw.new_product_id),
        },
      };
  }
}

function isHandledEventType(type: string): type is HandledEventType {
  return (handledEventTypes as readonly string[]).includes(type);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// RevenueCat sends `null` for fields that do not apply, hence "optional".
function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalEnvironment(value: unknown): 'SANDBOX' | 'PRODUCTION' | undefined {
  return value === 'SANDBOX' || value === 'PRODUCTION' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export default http;
