import { httpRouter } from 'convex/server';
import type { Infer } from 'convex/values';
import Stripe from 'stripe';

import { internal } from './_generated/api';
import { env, httpAction } from './_generated/server';
import { stripeClient } from './lib/stripe';
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

export default http;
