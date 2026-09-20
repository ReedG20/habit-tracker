import Stripe from 'stripe';

import { env } from '../_generated/server';

/**
 * Runs in the default (V8) runtime: Convex bundles for the browser condition,
 * which selects Stripe's fetch-based worker build. The explicit client makes
 * that choice visible rather than relying on the resolver.
 */
export function stripeClient(): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
}
