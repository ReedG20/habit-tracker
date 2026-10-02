// Multi-dot filename on purpose: the Convex bundler skips those, and this file
// is test-only (it imports vitest).
import Stripe from 'stripe';
import { vi } from 'vitest';

/**
 * A stand-in for the Stripe API, installed as the global `fetch`. The real
 * Stripe SDK (`lib/stripe.ts`) talks to it, so tests cover how requests are
 * built and how Stripe's answers (and errors) are parsed, not a mock of the SDK.
 */

export const SECRET_KEY = 'sk_test_fake';
export const WEBHOOK_SECRET = 'whsec_test_fake';

export type StripeCall = {
  method: string;
  /** e.g. `/v1/payment_intents` or `/v1/payment_intents/pi_1` */
  path: string;
  params: URLSearchParams;
  idempotencyKey: string | null;
};

type Route = (call: StripeCall) => Response | undefined;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Request-Id': 'req_test', ...headers },
  });
}

/** A PaymentIntent as Stripe returns it, with only the fields the app reads. */
export function paymentIntent(id: string, status: string, extra: Record<string, unknown> = {}) {
  return { id, object: 'payment_intent', status, client_secret: `${id}_secret_x`, ...extra };
}

/** Stripe's 402 for a declined card, the shape `Stripe.errors.StripeCardError` is built from. */
export function cardDeclined(
  paymentIntentId: string,
  declineCode = 'insufficient_funds',
): Response {
  return json(
    {
      error: {
        type: 'card_error',
        code: 'card_declined',
        decline_code: declineCode,
        message: 'Your card was declined.',
        payment_intent: paymentIntent(paymentIntentId, 'requires_payment_method'),
      },
    },
    402,
    { 'Stripe-Should-Retry': 'false' },
  );
}

/** A Stripe-side failure the SDK won't retry on its own (so fake timers never stall it). */
export function apiError(): Response {
  return json({ error: { type: 'api_error', message: 'Something went wrong' } }, 500, {
    'Stripe-Should-Retry': 'false',
  });
}

export function stripeFake() {
  const calls: StripeCall[] = [];
  const routes: Route[] = [];

  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (url.hostname !== 'api.stripe.com') {
      // Pushes and the like: logged only unless PUSH_DELIVERY is on, but never fail them.
      return json({ data: [] });
    }
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    const body = typeof init?.body === 'string' ? init.body : url.search.slice(1);
    const call: StripeCall = {
      method,
      path: url.pathname,
      params: new URLSearchParams(body),
      idempotencyKey: headers.get('Idempotency-Key'),
    };
    calls.push(call);
    for (const route of routes) {
      const response = route(call);
      if (response !== undefined) return response;
    }
    return json(
      {
        error: { type: 'invalid_request_error', message: `No fake for ${method} ${url.pathname}` },
      },
      404,
      { 'Stripe-Should-Retry': 'false' },
    );
  });

  return {
    fetch,
    calls,
    /** Answers `method path` (exact) with `respond`; later routes win over earlier ones. */
    on(method: string, path: string, respond: (call: StripeCall) => Response) {
      routes.unshift((call) =>
        call.method === method && call.path === path ? respond(call) : undefined,
      );
    },
    /** The calls to one endpoint. */
    callsTo(method: string, path: string) {
      return calls.filter((call) => call.method === method && call.path === path);
    },
  };
}

export type StripeFake = ReturnType<typeof stripeFake>;

/** A webhook request as Stripe would send it, signed with `secret`. */
export async function signedWebhook(
  event: { id: string; type: string; data: { object: Record<string, unknown> } },
  secret = WEBHOOK_SECRET,
): Promise<RequestInit> {
  const payload = JSON.stringify({ object: 'event', api_version: '2026-01-01', ...event });
  const header = await new Stripe(SECRET_KEY).webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  });
  return {
    method: 'POST',
    headers: { 'stripe-signature': header, 'Content-Type': 'application/json' },
    body: payload,
  };
}
