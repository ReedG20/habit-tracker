import rateLimiter from '@convex-dev/rate-limiter/convex.config.js';
import resend from '@convex-dev/resend/convex.config.js';
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
     * Google Places API (New) key used by location check-ins
     * (`locationProofs.analyze`) to list the places around the user. Server
     * side only; restrict it to "Places API (New)" in Google Cloud. Without it
     * every check-in resolves as `failed`, which excuses the day. Set with:
     *   bunx convex env set GOOGLE_PLACES_API_KEY AIza...
     */
    GOOGLE_PLACES_API_KEY: v.optional(v.string()),
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
    /**
     * RevenueCat secret API key (Project settings → API keys → Secret, `sk_...`),
     * used by `lockouts.confirmReentry` to see a re-entry purchase without
     * waiting for the webhook. Optional: without it unlocking waits for the
     * webhook. Set with:
     *   bunx convex env set REVENUECAT_SECRET_API_KEY sk_...
     */
    REVENUECAT_SECRET_API_KEY: v.optional(v.string()),
    /**
     * `1` turns on the developer bypasses (force-delete, lock and unlock on
     * demand; `lib/lockout.ts`). Set on dev and preview only, never production:
     *   bunx convex env set ANTE_DEV_OVERRIDES 1
     */
    ANTE_DEV_OVERRIDES: v.optional(v.string()),
    /**
     * `on` lets `push.send` actually deliver through Expo. Anywhere else pushes
     * are only logged, so a stray dev deployment never buzzes a real phone. Set
     * on preview and production:
     *   bunx convex env set PUSH_DELIVERY on
     */
    PUSH_DELIVERY: v.optional(v.string()),
    /**
     * Expo access token, needed only once "Enhanced push security" is turned on
     * for the project in the EAS dashboard. Set with:
     *   bunx convex env set EXPO_ACCESS_TOKEN ...
     */
    EXPO_ACCESS_TOKEN: v.optional(v.string()),
    /**
     * Resend API key for emails to users' friends (`emails.ts`). Set with:
     *   bunx convex env set RESEND_API_KEY re_...
     */
    RESEND_API_KEY: v.optional(v.string()),
    /**
     * Signing secret for the `/resend/webhook` endpoint (bounces and
     * complaints), from the Resend dashboard. Set with:
     *   bunx convex env set RESEND_WEBHOOK_SECRET whsec_...
     */
    RESEND_WEBHOOK_SECRET: v.optional(v.string()),
    /**
     * `on` lets emails actually leave through Resend. Anywhere else they are
     * only logged, so a dev deployment never emails a real person. Set on
     * production only:
     *   bunx convex env set EMAIL_DELIVERY on
     */
    EMAIL_DELIVERY: v.optional(v.string()),
    /** Overrides the sender, e.g. `Ante <hello@mail.useanteapp.com>`. */
    EMAIL_FROM: v.optional(v.string()),
    /**
     * Where contested charges, chargebacks and fraud warnings are emailed
     * (`emails.sendSupportCase`). Defaults to support@useanteapp.com. Set with:
     *   bunx convex env set SUPPORT_EMAIL support@useanteapp.com
     */
    SUPPORT_EMAIL: v.optional(v.string()),
    /**
     * `on` switches habits from the old re-entry fee to per-habit stakes
     * (`habitChecks.ts`). Flipped on production at cutover, alongside the
     * app release; removed once every build is past it.
     */
    STAKES_V2: v.optional(v.string()),
    /**
     * The lowest iOS build number (CFBundleVersion) allowed to run. Older
     * builds show "Time to update" instead of the app (`appVersion.ts`). Unset
     * means no gate. Only raise it once that build is live in the App Store:
     *   bunx convex env set MIN_IOS_BUILD 42
     */
    MIN_IOS_BUILD: v.optional(v.string()),
  },
});

/** Bounds the wording check, which anyone in onboarding can call (`commitmentChecks.ts`). */
app.use(rateLimiter);

/** Queues and retries emails to users' friends (`emails.ts`). */
app.use(resend);

export default app;
