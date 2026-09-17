import { defineApp } from 'convex/server';
import { v } from 'convex/values';

const app = defineApp({
  env: {
    /**
     * Clerk's Frontend API URL, used to validate access tokens. Set with:
     *   bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
     */
    CLERK_JWT_ISSUER_DOMAIN: v.string(),
  },
});

export default app;
