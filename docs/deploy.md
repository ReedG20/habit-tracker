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
  `convex/`), `vitest`. `.eas/workflows/pr-preview.yml` publishes an OTA update
  to the `preview` channel. `.github/workflows/convex-preview.yml` deploys a
  per-branch Convex backend, only if `CONVEX_DEPLOY_KEY_PREVIEW` is set (needs
  Convex Pro).
- **Push to `main`** — `.eas/workflows/deploy.yml`:
  1. `deploy_convex` pushes `convex/` to the **production** deployment.
  2. `fingerprint` hashes the native side; `get-build` looks for a production
     build with that hash.
  3. Found → OTA update on the `production` channel. Not found → new build,
     submitted to TestFlight / Play internal.

The backend deploys before any client because old bundles keep running until
they fetch the update: keep Convex functions backwards compatible for at least
one release (add optional fields, never rename or remove without a grace
period).

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
```

Then in the Convex dashboard → project settings → **Deploy keys**, generate a
**Production** deploy key for step 4.

### 2. Clerk production instance

A Clerk instance is a separate user database and configuration. The
`pk_test_` key is the **development** instance, which Clerk will not let serve
real users (rate limits, shared OAuth apps). Production is a blank instance on
your own domain, and nothing copies over: rebuild the three things below.

1. Clerk dashboard → instance dropdown → **Create production instance** with the
   apex domain you own (`useanteapp.com`). Add the CNAME records it lists at
   your DNS provider and wait for Configure → **Domains** to show them verified.
   The **Frontend API URL** shown there (`https://clerk.useanteapp.com`) is
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

### 4. EAS production environment

expo.dev → project → **Environment variables** → `production`. It is empty
today. Create:

| Name                                      | Value                                    | Visibility |
| ----------------------------------------- | ---------------------------------------- | ---------- |
| `EXPO_PUBLIC_CONVEX_URL`                  | `https://<prod-deployment>.convex.cloud` | plain      |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`       | `pk_live_...`                            | plain      |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`      | `pk_live_...`                            | plain      |
| `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID`  | as in `development`                      | plain      |
| `EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID`  | as in `development`                      | plain      |
| `EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME` | as in `development`                      | plain      |
| `CONVEX_DEPLOY_KEY`                       | the Production deploy key from step 1    | **secret** |

Or from the CLI, one at a time:

```bash
bunx eas-cli@latest env:create --environment production --scope project --visibility plain --name EXPO_PUBLIC_CONVEX_URL --value https://...
```

### 5. EAS: GitHub, credentials, stores

- expo.dev → project → **GitHub** → install the Expo GitHub app on
  `ReedG20/habit-tracker`. Workflows in `.eas/workflows/` only trigger once
  the repo is connected.
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

- Branch protection on `main`: require the **Lint, typecheck, test** check.
- Optional secret `CONVEX_DEPLOY_KEY_PREVIEW` (Convex → Deploy keys →
  **Preview**) to enable per-PR Convex backends.

### 7. First production run

Merge to `main`. The first `deploy.yml` run always builds (there is no
production build with the current fingerprint yet). Watch it under expo.dev →
**Workflows**. Once the build is on TestFlight, the next JS-only push takes the
OTA path; the Me screen shows the running update id.

## Day to day

```bash
bun run lint && bun run typecheck && bun run test   # what CI runs
bunx eas-cli@latest build --profile preview -p ios  # a testable build on the dev backend
bunx eas-cli@latest workflow:run deploy.yml         # re-run the production pipeline by hand
```

Rolling back an OTA update: expo.dev → Updates → `production` branch →
republish the previous update. Rolling back the backend: `git revert` and push
to `main`; `convex deploy` is idempotent.

Never run `bunx convex deploy` from a laptop with `CONVEX_DEPLOY_KEY` set, and
read the deployment name every command prints before confirming.
