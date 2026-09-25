# Deploying Ante

Three deployment targets, each with its own Convex deployment, EAS environment
and update channel:

| Target      | Convex deployment           | EAS environment | Update channel | Keys                   |
| ----------- | --------------------------- | --------------- | -------------- | ---------------------- |
| development | your `dev:*` (`.env.local`) | `development`   | `development`  | `pk_test_`, `sk_test_` |
| preview     | the shared dev deployment   | `preview`       | `preview`      | `pk_test_`, `sk_test_` |
| production  | `whimsical-labrador-585`    | `production`    | `production`   | `pk_live_`, `sk_live_` |

`EXPO_PUBLIC_*` values are inlined into the JS bundle when it is built, so the
EAS environment a build or update runs in decides which backend it talks to.
Server secrets never leave the Convex deployment (`convex/convex.config.ts`).

## What runs automatically

- **Every PR** — `.github/workflows/ci.yml`: lint, Prettier, `tsc` (app and
  `convex/`), `vitest`. Required by the `Protect main` ruleset.
  `.github/workflows/convex-preview.yml` deploys a per-branch Convex backend,
  only if `CONVEX_DEPLOY_KEY_PREVIEW` is set (needs Convex Pro).
- **Push to `main`** — `.github/workflows/deploy.yml`, one job:
  1. `convex deploy` to the **production** deployment.
  2. Computes the iOS native fingerprint (`scripts/eas-has-build.sh`) and asks
     EAS whether a `preview` and a `production` build have it.
  3. **Preview:** a matching build → `eas update` to the `preview` channel from
     the Actions runner (about two minutes); your internal build picks it up on
     its next two launches. No match → a new internal preview build to install.
  4. **Production:** a matching build → nothing; production users wait for a
     Release. No match → `eas build --auto-submit`, which lands on TestFlight.
- **Release** — `.github/workflows/release.yml`, run by hand (below). Ships the
  code on your preview build to production over the air.

Everything runs on GitHub Actions so the common case never waits in EAS's
queue; only native builds do. Adding a dependency with native code, changing a
config plugin, adding a patch to a native package, or bumping the SDK changes
the fingerprint and triggers builds.

The backend deploys to production on merge, before any client can use it:
production keeps running the last released bundle, so keep Convex functions
backwards compatible for at least one release (add optional fields, never
rename or remove without a grace period).

The preview build talks to the **shared dev deployment**, which nothing in CI
deploys: it has whatever `bunx convex dev` last pushed from a laptop. Before
relying on a preview update that needs new functions, deploy them there (run
`bunx convex dev` from a checkout that has them).

## Releasing to production

When the preview build has been on your phone and it's good:

```bash
gh workflow run release.yml                 # ship what the preview build is running
gh workflow run release.yml -f ref=<sha>    # or a specific merged commit
```

or GitHub → **Actions** → **Release** → **Run workflow**. It looks up the git
commit of the latest `preview` update, checks it is on `main`, checks a
production build has the same native code, and publishes it to the
`production` channel. It rebuilds the bundle instead of copying the preview
one: `EXPO_PUBLIC_*` values are inlined when bundling, and preview's point at
the dev backend and test keys.

If the release refuses because no production build has the commit's native
code, the change needs a store build: Deploy started one on merge, and it
already contains that code, so ship it through TestFlight instead.

`convex/_generated/` is committed and CI typechecks against it. After changing
functions, keep `bunx convex dev` running (it regenerates on save) or run
`bunx convex codegen` before committing; it needs a configured deployment, so
CI does not regenerate it.

## One-time setup

Work through these in order. Everything below touches production; run each
command yourself and confirm the target it prints.

### 1. Convex production deployment

```bash
bunx convex deploy --dry-run
```

It prints the production deployment it would push to: `whimsical-labrador-585`
(`https://whimsical-labrador-585.convex.cloud`, site
`https://whimsical-labrador-585.convex.site`). Set its secrets — the `convex.config.ts` declarations make a deploy fail until
every one exists:

```bash
bunx convex env set --prod CLERK_JWT_ISSUER_DOMAIN https://clerk.<your-domain>
bunx convex env set --prod OPENROUTER_API_KEY sk-or-...
bunx convex env set --prod STRIPE_SECRET_KEY sk_live_...
bunx convex env set --prod STRIPE_WEBHOOK_SECRET whsec_...   # after step 3
bunx convex env set --prod REVENUECAT_WEBHOOK_AUTH "Bearer $(openssl rand -hex 32)"   # see step 3b
```

Then in the Convex dashboard → production deployment → Settings → **Deploy
keys**, generate a key with only `deployment:deploy` for step 6.

### 2. Clerk production instance

A Clerk instance is a separate user database and configuration. The
`pk_test_` key is the **development** instance, which Clerk will not let serve
real users (rate limits, shared OAuth apps). Production is a blank instance on
your own domain, and nothing copies over: rebuild the three things below.

1. Clerk dashboard → instance dropdown → **Create production instance** with the
   apex domain you own (`useanteapp.com`). Add the five CNAME records it lists
   (Configure → Domains → Configure) at the DNS provider and click **Verify
   Records**; Clerk then issues the TLS certificate. Until that is done the
   app hangs on the splash screen: `clerk.useanteapp.com` does not resolve, so
   Clerk never loads and `useConvexAuth` never leaves `isLoading`. The
   **Frontend API URL** (`https://clerk.useanteapp.com`) is
   `CLERK_JWT_ISSUER_DOMAIN` for prod (step 1).
2. Switch the dropdown to **Production** and rebuild:
   - Configure → **Native applications**: enable the Native API and add the
     iOS app, bundle id `com.useanteapp.ante`, team `QYZY3GZC8B`. (Android,
     when it comes, also needs the SHA-256 of the EAS-managed keystore.)
   - Configure → **SSO connections**: Apple and Google, each with your own
     OAuth credentials (dev used Clerk's shared ones). Apple: Services ID, Team
     ID, Sign in with Apple key from developer.apple.com. Google: the web OAuth
     client's ID and secret — the same client as
     `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID`, so the three
     `EXPO_PUBLIC_CLERK_GOOGLE_*` values stay the same in production.
   - Configure → **JWT templates** → new from the **Convex** preset, named
     exactly `convex`. `ConvexProviderWithClerk` requests a token from that
     template and `convex/auth.config.ts` checks its audience; without it every
     production request is unauthenticated.
3. Copy the production **publishable key** (`pk_live_...`) for step 4.

### 3. Stripe live mode

Stripe dashboard, live mode → Developers → Webhooks → add endpoint:

- URL: `https://whimsical-labrador-585.convex.site/stripe/webhook`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
  `charge.refunded`, `charge.dispute.created`

Copy its signing secret into `STRIPE_WEBHOOK_SECRET` (step 1) and the live
publishable key `pk_live_...` for step 4.

For local development, forward test-mode events to your dev deployment
(`cool-kiwi-961` today; check `CONVEX_DEPLOYMENT` in `.env.local`):

```bash
stripe listen --forward-to https://cool-kiwi-961.convex.site/stripe/webhook --events payment_intent.succeeded,payment_intent.payment_failed,charge.refunded,charge.dispute.created
```

The `whsec_` it prints is stable for your CLI login and is already set as
`STRIPE_WEBHOOK_SECRET` on dev. If it ever changes, update it with
`bunx convex env set STRIPE_WEBHOOK_SECRET ...` (no `--prod`: that targets dev).

### 3b. RevenueCat and App Store subscriptions

**App Store Connect** → the app → Subscriptions → group **Ante Pro**:

| Product ID         | Duration | Price  | Introductory offer                |
| ------------------ | -------- | ------ | --------------------------------- |
| `ante_pro_monthly` | 1 month  | $7.99  | none                              |
| `ante_pro_annual`  | 1 year   | $49.99 | Free trial, 1 week, all countries |

Each needs a localization and a review screenshot before it reads "Ready to
Submit"; the SDK returns nothing for a product without one, so the paywall
falls back to "Plans aren't available right now". The group itself also needs a
display name localization. The Paid Apps agreement must be signed.

Keep both subscriptions at the **same level** in the group. Level 1 is the
highest service tier, so leaving monthly above annual makes monthly → annual a
_downgrade_ (deferred to the end of the paid month) and annual → monthly an
_upgrade_ (immediate, prorated) — backwards. Same level makes either switch a
crossgrade that takes effect at the next renewal.

Under Users and Access → Integrations, create an **In-App Purchase** key and
note the app-specific shared secret for RevenueCat. Create a Sandbox tester
(Users and Access → Sandbox) for device testing.

**RevenueCat dashboard** → project **Ante** → iOS app `com.useanteapp.ante`
(upload the In-App Purchase key):

- Products: import both product IDs from App Store Connect.
- Entitlements: `ante_pro`, with both products attached. The code reads exactly
  this identifier (`PRO_ENTITLEMENT`).
- Offerings: `default` (marked current) with packages `$rc_monthly` →
  `ante_pro_monthly` and `$rc_annual` → `ante_pro_annual`. The paywall reads
  `offering.monthly` / `offering.annual`.
- The app's **public API key** (`appl_...`) goes into
  `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` in every EAS environment (step 4) and
  `.env.local`.
- Integrations → Webhooks → two webhooks, both with Authorization header set
  to the exact `REVENUECAT_WEBHOOK_AUTH` value of the deployment they target:
  - **Sandbox** events only → `https://cool-kiwi-961.convex.site/revenuecat/webhook`
  - **Production** events only → `https://whimsical-labrador-585.convex.site/revenuecat/webhook`

  Send a test event from the dashboard; the Convex logs show a 200 and a
  `TEST` row lands in `revenuecatEvents`. Webhooks are gated by RevenueCat's
  plan: without them the client still knows it is Pro from the SDK, but the
  Convex `subscriptions` mirror (and anything the server gates on it) stays
  empty.

Real StoreKit sandbox purchases need a **development build on a device**
signed into a Sandbox Apple ID (Settings → App Store → Sandbox Account), and a
product Apple still lists as "Missing Metadata" is not returned at all — the
paywall then shows its "Plans aren't available" state. An OTA update cannot add
the native module to an existing build either.

For day-to-day work on the paywall, set `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY`
in `.env.local` instead (see `.env.example`): the **Test Store** sells the same
offerings and entitlements in the simulator, with no App Store Connect products
involved, and its success/failure/cancel modal makes the error paths easy to
exercise. Test subscriptions renew five times and then cancel themselves.

### 4. EAS production environment

expo.dev → project → **Environment variables** → `production`. `eas update
--environment production` and `eas build` bundle these into the app:

| Name                                      | Value                                    | Visibility |
| ----------------------------------------- | ---------------------------------------- | ---------- |
| `EXPO_PUBLIC_CONVEX_URL`                  | `https://<prod-deployment>.convex.cloud` | plain      |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`       | `pk_live_...`                            | plain      |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`      | `pk_live_...`                            | plain      |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`      | `appl_...` (same in every environment)   | plain      |
| `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID`  | as in `development`                      | plain      |
| `EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID`  | as in `development`                      | plain      |
| `EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME` | as in `development`                      | plain      |

Or from the CLI, one at a time:

```bash
bunx eas-cli@latest env:create --environment production --scope project --visibility plain --name EXPO_PUBLIC_CONVEX_URL --value https://...
```

### 5. EAS: GitHub, credentials, stores

- Signing credentials (EAS creates and stores the distribution certificate
  and provisioning profile; you sign in with your Apple ID once):
  ```bash
  bunx eas-cli@latest credentials:configure-build -p ios --profile production
  ```
- App Store Connect: the app record is **Ante: Habits with Stakes**
  (App ID `6814632907`, already in `eas.json` → `submit.production.ios.ascAppId`).
  For `submit` to run unattended, EAS needs an App Store Connect API key:
  ASC → Users and Access → Integrations → App Store Connect API → generate a
  key with the **App Manager** role, then upload it with
  `bunx eas-cli@latest credentials -p ios` → App Store Connect API Key.

### 6. GitHub

Repository → Settings → Secrets and variables → Actions:

| Secret                      | Value                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `EXPO_TOKEN`                | expo.dev → account → **Access tokens** → new token          |
| `CONVEX_DEPLOY_KEY`         | the production deploy key from step 1                       |
| `CONVEX_DEPLOY_KEY_PREVIEW` | optional; Convex **Preview** deploy key for per-PR backends |

The `Protect main` ruleset (Settings → Rules) requires a PR and the
**Lint, typecheck, test** check before anything reaches `main`.

### 7. First production run

Merge to `main`. The first `Deploy` run builds (there is no production build
with the current fingerprint yet); watch the job under GitHub → **Actions**
and the build under expo.dev → **Builds**. Once the build is on TestFlight,
JS-only changes reach it through **Release**; the Me screen shows the running
update id.

## Testing a production build

TestFlight installs over the dev build (same bundle id), so the dev client's
menu disappears; reinstall a `development` profile build to get it back.
Production builds talk to the production Clerk instance and Convex deployment
— sign-ins there are real users, and stakes charge live cards.

## Day to day

```bash
bun run lint && bun run typecheck && bun run test   # what CI runs
bunx eas-cli@latest build --profile preview -p ios  # a testable build on the dev backend
gh workflow run deploy.yml                          # re-run the merge pipeline by hand
gh workflow run release.yml                         # ship the preview build's code to production
```

If a build finished but the TestFlight upload failed (Apple's upload service
has bad days), check App Store Connect → TestFlight first: the upload often
went through and only the confirmation was lost. If it really is missing:

```bash
bunx eas-cli@latest submit -p ios --profile production --latest
```

A "build number already used" error means Apple did keep it — nothing to do.

Rolling back an OTA update: expo.dev → Updates → `production` branch →
republish the previous update, or `gh workflow run release.yml -f ref=<last good sha>`. Rolling back the backend: `git revert` and push
to `main`; `convex deploy` is idempotent.

Never run `bunx convex deploy` from a laptop with `CONVEX_DEPLOY_KEY` set, and
read the deployment name every command prints before confirming.
