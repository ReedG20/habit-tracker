import rateLimiter from '@convex-dev/rate-limiter/convex.config.js';
import { defineApp } from 'convex/server';
import { v } from 'convex/values';

const app = defineApp({
  env: {
    /**
     * Clerk's Frontend API URL, used to validate access tokens. Set with:
     *   bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
     */
    CLERK_JWT_ISSUER_DOMAIN: v.string(),
    /**
     * OpenRouter key used by photo verification (`verifications.analyze`) and
     * the wording check (`commitmentChecks.check`). Set with:
     *   bunx convex env set OPENROUTER_API_KEY sk-or-...
     */
    OPENROUTER_API_KEY: v.string(),
    /**
     * Stripe secret key used to save cards and settle missed goals (`goals.ts`,
     * `stripe.ts`). Set with:
     *   bunx convex env set STRIPE_SECRET_KEY sk_...
     */
    STRIPE_SECRET_KEY: v.string(),
    /**
     * Signing secret for the `/stripe/webhook` endpoint (`http.ts`). In
     * production it is the endpoint's secret from the Stripe dashboard; in
     * development it is the one `stripe listen` prints. Set with:
     *   bunx convex env set STRIPE_WEBHOOK_SECRET whsec_...
     */
    STRIPE_WEBHOOK_SECRET: v.string(),
    /**
     * The exact `Authorization` header RevenueCat sends to `/revenuecat/webhook`
     * (`http.ts`). Any long random value; paste the same string into the
     * RevenueCat dashboard → Integrations → Webhooks → Authorization header.
     * Set with:
     *   bunx convex env set REVENUECAT_WEBHOOK_AUTH "Bearer $(openssl rand -hex 32)"
     */
    REVENUECAT_WEBHOOK_AUTH: v.string(),
  },
});

/** Bounds the wording check, which anyone in onboarding can call (`commitmentChecks.ts`). */
app.use(rateLimiter);

export default app;
