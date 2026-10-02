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
  2. `convex deploy` to the **shared dev deployment**, which the preview build
     talks to. Without `CONVEX_DEPLOY_KEY_DEV` the job stops here, so preview
     never gets a bundle its backend can't serve.
  3. Computes the iOS native fingerprint (`scripts/eas-has-build.sh`) and asks
     EAS whether a `preview` and a `production` build have it.
  4. **Preview:** a matching build → `eas update` to the `preview` channel from
     the Actions runner (about two minutes); your internal build picks it up on
     its next two launches. No match → a new internal preview build to install.
  5. **Production:** a matching build → nothing; production users wait for a
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

The preview build talks to the **shared dev deployment**. Every merge deploys
`main` there before the preview update goes out. Between merges it has whatever
`bunx convex dev` last pushed from a laptop, so a `convex dev` left running on
an old or unmerged branch can push functions the preview build doesn't expect
(or drop ones it does). Stop it, or pull `main`, once a branch has merged.

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

### How updates reach phones

An OTA update is downloaded on a cold start or when the app comes back to the
foreground (at most every 10 minutes, `src/hooks/use-foreground-updates.ts`).
It is applied on the next cold start, or the next time the app comes back after
15 minutes or more away, unless a flow is open (writing a commitment,
onboarding, raising stakes, a restart, the paywall).

### Forcing an update

A store build can't be updated over the air past its native code, and old
builds keep talking to the live backend. To stop builds older than `N`:

```bash
bunx convex env set MIN_IOS_BUILD N --prod    # from the main checkout
bunx convex env remove MIN_IOS_BUILD --prod   # lift the gate
```

Every iOS build below `N` (the CFBundleVersion, which production builds
auto-increment; see App Store Connect → TestFlight) shows "Time to update" with
a link to the App Store in place of the app, before and after sign-in, within
seconds for anyone with it open. Only raise it once build `N` is **live in the
App Store**, or people are stopped with nothing to update to. Unset, garbage
or zero means no gate, and the app fails open while offline.

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
bunx convex env set --prod REVENUECAT_SECRET_API_KEY sk_...   # optional; see step 3b
bunx convex env set --prod PUSH_DELIVERY on   # deadline reminders; see below
```

`PUSH_DELIVERY=on` lets the backend actually send reminder pushes. Set it on
production and on the shared dev deployment (preview builds), and nowhere
else: the per-worktree dev deployments leave it off, so they only log what
they would have sent and never buzz a real phone.

`ANTE_DEV_OVERRIDES=1` (force-delete, lock and unlock on demand) goes on the
shared dev deployment only, which preview builds also use. **Never set it on
production.**

**Stakes cutover.** Per-habit stakes (money, friend, lockout freeze, or none)
and the free lockout freeze run only where `STAKES_V2=on`; without it the
backend still runs the old re-entry fee lockout. Before releasing, on the
shared dev deployment first and then production (`convex/migrations.ts`):

```bash
bunx convex run --prod migrations:goalStakesToTable     # any time after deploy
bunx convex env set --prod STAKES_V2 on
bunx convex run --prod migrations:habitsToLockoutStakes
bunx convex run --prod migrations:feeLockoutsToFreezes
bunx convex run --prod migrations:status                # until nothing is left
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
  `charge.refunded`, `charge.dispute.created`,
  `radar.early_fraud_warning.created`

Copy its signing secret into `STRIPE_WEBHOOK_SECRET` (step 1) and the live
publishable key `pk_live_...` for step 4.

For local development, forward test-mode events to your dev deployment
(`cool-kiwi-961` today; check `CONVEX_DEPLOYMENT` in `.env.local`):

```bash
stripe listen --forward-to https://cool-kiwi-961.convex.site/stripe/webhook --events payment_intent.succeeded,payment_intent.payment_failed,charge.refunded,charge.dispute.created,radar.early_fraud_warning.created
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

**Re-entry fee (`ante_reentry`, $9.99 consumable): being retired.** Before
the stakes cutover (below), a missed habit locks the app until this fee is
paid (`convex/lockouts.ts`). After it, a lockout is a free 1, 3 or 7 day
freeze and nothing sells `ante_reentry`. The site's Terms already describe
the cutover state, so don't attach `ante_reentry` to an App Store version,
and finish the cutover before release.

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
  `offering.monthly` / `offering.annual`. Attach the **App Store** product to
  each package, not only the Test Store one: EAS builds ignore the test key, so
  a package with only a Test Store product is empty there and the paywall shows
  "Plans aren't available".
- `ante_reentry` (pre-cutover builds only) is attached to **no** entitlement
  and in no offering; the old locked screen buys it by product ID.
- Project settings → API keys → a **secret** key (`sk_...`) in
  `REVENUECAT_SECRET_API_KEY` on each Convex deployment. With it,
  `lockouts.confirmReentry` unlocks the moment the purchase completes; without
  it, unlocking waits for the webhook.
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
- Push notifications (deadline reminders go through the Expo Push Service):
  `bunx eas-cli@latest credentials -p ios` → Push Notifications → set up a
  push key, which EAS generates and keeps. One key serves development and
  production. The Time Sensitive Notifications capability comes from
  `app.config.ts`; EAS enables it on the App ID at build time.

### 5b. PostHog (analytics, session replay, crashes)

One PostHog project (US cloud, project id `636348`) takes every environment.
Its token is public by design and lives in `src/lib/analytics.ts`, so the
client needs no environment variables. Every event carries `app_env`
(`development`, `preview` or `production`); the project's test-account filter
hides development and preview. Events the native iOS SDK sends itself (native
crashes, `$rageclick`) carry no `app_env` and count as production. Session replay runs in preview and production
builds only.

Readable stack traces need source maps (and dSYMs) uploaded. Builds do it from
Xcode through the `posthog-react-native/expo` plugin; OTA updates do it in the
Deploy and Release workflows. Both need a **personal** API key: PostHog →
avatar → Personal API keys → new key. Scope it to the organization that holds
Ante (Organization: Read isn't offered on project-scoped keys), with
**error tracking: write** and **organization: read** only. Then set it in every EAS
environment and in GitHub:

```bash
# With the key on the clipboard, so it stays out of shell history:
bunx eas-cli@latest env:set --environment development --environment preview --environment production \
  --scope project --visibility secret --name POSTHOG_CLI_API_KEY --value "$(pbpaste)"
gh secret set POSTHOG_CLI_API_KEY   # prompts for the value
```

An EAS build without it **fails** at the upload step, so set it before
merging a native change. `POSTHOG_CLI_PROJECT_ID` and `POSTHOG_CLI_HOST` are
not secret and sit in `eas.json`. Without the GitHub secret, the OTA steps
skip the upload with a warning.

### 6. GitHub

Repository → Settings → Secrets and variables → Actions:

| Secret                      | Value                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `EXPO_TOKEN`                | expo.dev → account → **Access tokens** → new token          |
| `CONVEX_DEPLOY_KEY`         | the production deploy key from step 1                       |
| `CONVEX_DEPLOY_KEY_DEV`     | the shared dev deployment's deploy key (see below)          |
| `CONVEX_DEPLOY_KEY_PREVIEW` | optional; Convex **Preview** deploy key for per-PR backends |
| `POSTHOG_CLI_API_KEY`       | PostHog personal API key for OTA source maps (step 5b)      |

`CONVEX_DEPLOY_KEY_DEV`: Convex dashboard → the **dev** deployment
(`cool-kiwi-961`) → Settings → **Deploy keys** → generate one. It starts with
`dev:`; the workflow refuses anything else.

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

## Support, contested charges and disputes

Charging a saved card after someone misses is the setup most likely to end
in chargebacks, and too many of those get a Stripe account reviewed or
closed. So the app sends people to us first:

- **Me → Contact support** opens an email to support@useanteapp.com with the
  app version filled in. Terms and Privacy are linked there too.
- **"Something wrong with this charge?"** sits on the loss screen and under
  "the deal" on a commitment whose money was charged. It opens
  `/contest/[stakeId]`, which records a `chargeReviews` row and emails support
  the whole case: the signed contract, how the run ended, the last proof with
  photos and verdicts, and a link to the payment in Stripe.
- **Proof is kept** for 130 days after a money stake comes due, even if the
  habit or goal is deleted (`convex/evidence.ts`).
- **Our own failures don't cost money.** If a goal's last proof never got a
  verdict (an error or a timeout), its stake is released, the same as a
  habit's excused day.

**Handling a contested charge** (the email arrives at `SUPPORT_EMAIL`):

- To refund, refund the payment in Stripe. The `charge.refunded` webhook
  marks the stake and the review refunded and pushes "Refunded" to the user.
- To keep the charge, run `chargeReviews:decline` from the Convex dashboard
  with `{ stakeId, response }`. The response is pushed to the user word for
  word, so keep it short and kind. Replying to the email reaches the user too,
  unless they signed in with Apple's private relay.

**Disputes and fraud warnings** are handled by the webhook:

- On `charge.dispute.created` the stake becomes `disputed`, money stakes are
  turned off for that user (`users.moneyBlocked`), and support gets the case.
  Answer the dispute in Stripe with what the email contains.
- On `radar.early_fraud_warning.created` the charge is refunded straight away,
  since that costs less than losing the chargeback that would follow. Money
  stakes are turned off and support gets the case.
- To turn money back on for a user, clear `moneyBlocked` on their `users` row
  in the Convex dashboard.

**One-time setup:**

- [x] A support@useanteapp.com mailbox (2026-10-01). `SUPPORT_EMAIL`
      overrides it per deployment. Emails only leave where
      `EMAIL_DELIVERY=on`; elsewhere they're logged.
- [x] Stripe → Settings → Public details: public business name `Ante` and
      support email support@useanteapp.com (set 2026-10-01). The statement descriptor is
      `USEANTEAPP.COM` with a shortened descriptor of `ANTE APP`; charges add
      `MISSED HABIT` or `MISSED GOAL`, so the statement reads
      "ANTE APP\* MISSED HABIT", exactly Stripe's 22-character limit. Keep the
      shortened descriptor at 8 characters or fewer.
- [x] Stripe → Settings → Customer emails: successful payments and refunds
      are on (2026-10-01). Charges carry `receipt_email` unless the address is
      Apple's private relay, which drops Stripe's mail.
- [x] `radar.early_fraud_warning.created` added to the live endpoint
      (2026-10-01). Dev uses `stripe listen` (see step 3), so there's no
      test-mode endpoint to update.
- [ ] Stripe → Settings → Business details: describe Ante accurately, e.g.
      "Habit app where users pre-authorize a penalty charge, set by them, if
      they miss a commitment they made." A surprise review is how accounts get
      frozen.
- [ ] A support page at useanteapp.com/support. App Store Connect requires a
      Support URL (guideline 1.5). Put a refund and contest policy in the
      Terms.
- [x] RevenueCat → Lifecycle → Refund Control: the default policy is "Send
      consumption data only" (2026-10-01). It answers Apple's refund requests
      for Ante Pro with delivery data and no preference; blanket declines are
      discounted by Apple and push people toward chargebacks. It relies on
      App Store Connect → App Information → App Store Server Notifications
      (production and sandbox) pointing at RevenueCat, set the same day.
- [ ] Privacy policy: say that purchase and delivery details are shared with
      Apple when a user asks Apple for a refund. RevenueCat tells Apple the
      user consented (`customerConsented`).

**App Review notes (draft):**

> Ante is a habit and goal tracker with optional stakes. When a user creates a
> commitment they may choose a money stake: an amount they set (from $1, up to $250 in
> total), charged to their own card through Stripe only if they miss the
> commitment. It is a penalty the user sets for themselves. Nobody wins money,
> nothing is paid out, and the charge unlocks no digital content or feature.
> Ante Pro, the subscription that unlocks the app, is sold through In-App
> Purchase. Users can contest any charge in the app ("Something wrong with
> this charge?") and reach support from Me → Contact support.
