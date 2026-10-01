import { httpRouter } from 'convex/server';
import type { Infer } from 'convex/values';
import Stripe from 'stripe';

import { internal } from './_generated/api';
import { env, httpAction } from './_generated/server';
import { resendClient } from './emails';
import { escapeHtml } from './lib/emailCopy';
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
        stakeId: intent.metadata.stakeId,
        goalId: intent.metadata.goalId,
      };
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const failure = intent.last_payment_error;
      return {
        type: event.type,
        paymentIntentId: intent.id,
        stakeId: intent.metadata.stakeId,
        goalId: intent.metadata.goalId,
        reason: failure?.decline_code ?? failure?.code ?? failure?.message ?? 'Payment failed',
      };
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      return {
        type: event.type,
        paymentIntentId: idOf(charge.payment_intent),
        stakeId: charge.metadata.stakeId,
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
    case 'radar.early_fraud_warning.created': {
      const warning = event.data.object;
      return {
        type: event.type,
        paymentIntentId: idOf(warning.payment_intent),
        warningId: warning.id,
        actionable: warning.actionable,
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
          transactionId: optionalString(raw.transaction_id),
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

/**
 * Resend → `emails.handleEmailEvent` (bounces and complaints). Register
 * `https://<deployment>.convex.site/resend/webhook` in the Resend dashboard
 * with the `email.*` events, and set its secret as `RESEND_WEBHOOK_SECRET`.
 */
http.route({
  path: '/resend/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, req) => await resendClient().handleResendEventWebhook(ctx, req)),
});

/**
 * The opt-out link in every email to a friend. GET only shows a page with the
 * choices: mail scanners open links on their own, and a GET that acted would
 * unsubscribe people who never clicked. POST acts, from that page's buttons,
 * or from a mail client's one-click unsubscribe (RFC 8058, no `scope`).
 */
http.route({
  path: '/email/opt-out',
  method: 'GET',
  handler: httpAction(async (ctx, req) => {
    const token = new URL(req.url).searchParams.get('t') ?? '';
    const friend = token === '' ? null : await ctx.runQuery(internal.friends.byToken, { token });
    if (friend === null) {
      return page('This link has expired', '<p>There’s nothing to opt out of here.</p>', 404);
    }

    const name = escapeHtml(friend.userName);
    const action = `/email/opt-out?t=${encodeURIComponent(token)}`;
    return page(
      'Stop these emails?',
      `<p>${name} named you as someone who hears about it when they miss a commitment on Ante.</p>
<form method="post" action="${escapeHtml(action)}&scope=user"><button type="submit">Stop emails about ${name}</button></form>
<form method="post" action="${escapeHtml(action)}&scope=all"><button type="submit" class="secondary">Never email me from Ante</button></form>`,
    );
  }),
});

http.route({
  path: '/email/opt-out',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const params = new URL(req.url).searchParams;
    const token = params.get('t') ?? '';
    const everyone = params.get('scope') === 'all';
    const done =
      token !== '' && (await ctx.runMutation(internal.friends.optOut, { token, everyone }));
    if (!done) {
      return page('This link has expired', '<p>There’s nothing to opt out of here.</p>', 404);
    }
    return page(
      'You’re opted out',
      everyone
        ? '<p>Ante won’t email you again.</p>'
        : '<p>You won’t get any more emails about them. We’ll let them know to pick someone else.</p>',
    );
  }),
});

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
body{margin:0;background:#fff;color:#111113;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
main{max-width:480px;margin:0 auto;padding:48px 24px}
.brand{font-size:20px;font-weight:700;color:#4121FF;margin-bottom:32px}
h1{font-size:28px;line-height:34px;margin:0 0 16px}
p{font-size:16px;line-height:24px;margin:0 0 24px}
button{display:block;width:100%;margin:0 0 12px;padding:14px 20px;border:0;border-radius:999px;background:#4121FF;color:#fff;font-size:16px;font-weight:600}
button.secondary{background:#F0F0F3;color:#111113}
@media (prefers-color-scheme:dark){body{background:#000;color:#fff}button.secondary{background:#212225;color:#fff}}
</style></head><body><main><div class="brand">Ante</div><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default http;
