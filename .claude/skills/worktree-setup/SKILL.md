---
name: worktree-setup
description: Give a git-worktree session its own Convex dev deployment, Metro port and iOS simulator so several Claude sessions can build features in parallel without colliding. Load it in any session under .claude/worktrees/ before the first Convex command, before launching or screenshotting the app, before opening a PR, and when the user says a feature is done.
---

# Parallel worktree setup

Up to four Claude sessions run at once, each in its own worktree under
`.claude/worktrees/<name>/`. Git already isolates files and branches. This skill
isolates everything else: each worktree gets **its own Convex dev deployment, its
own Metro port and its own simulator**.

Everything here is idempotent: check first, then do only what's missing.

## 0. Where am I?

```bash
[ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ] && echo worktree || echo main
basename "$(git rev-parse --show-toplevel)"   # <name>, used below
```

In the **main checkout**, stop here: it deliberately stays on the shared dev
deployment `cool-kiwi-961` and simulator `948E5A44-1762-4E87-BFC6-758CC153833B`.

## 1. Convex: own deployment (before ANY Convex command)

`.env.local` is copied in from the main checkout (via `.worktreeinclude`), so it
starts out pointing at the shared deployment. If it still does, set up your own:

```bash
grep -q cool-kiwi-961 .env.local && echo "NOT isolated yet" || grep ^CONVEX_DEPLOYMENT .env.local
```

If it is not isolated yet, run these from the worktree root, replacing `<name>`.
Run them as **four separate commands**. The guard hook checks `.env.local`
before each command runs, so it has to already point at the new deployment
before the next one starts.

```bash
bunx convex deployment select dev/wt-<name> \
  || bunx convex deployment create dev/wt-<name> --type dev --select --expiration "in 5 days"
```
```bash
bunx convex env list --deployment cool-kiwi-961 > "$TMPDIR/wt-env-<name>"
```
```bash
bunx convex env set --from-file "$TMPDIR/wt-env-<name>" --force; rm -f "$TMPDIR/wt-env-<name>"
```
```bash
bunx convex dev --once
```

- `--select` rewrites `CONVEX_DEPLOYMENT`, `EXPO_PUBLIC_CONVEX_URL` and
  `EXPO_PUBLIC_CONVEX_SITE_URL` in `.env.local`. Re-run the grep to confirm.
- `CONVEX_DEPLOYMENT` shows the generated name (e.g. `dev:valuable-ptarmigan-309`),
  not `dev/wt-<name>`. That's expected.
- After each change under `convex/`, push with `bunx convex dev --once`. You can
  also run `bunx convex dev` in the background for watch mode.
- The deployment starts empty. Signing in through the app creates the user row
  (same Clerk dev instance). Seed anything else through the app or `bunx convex run`.
- If the deployment expired (after 5 days, the most Convex allows), `select` fails and `create` makes a fresh one.
- Stripe webhooks: `stripe listen --forward-to https://<your-deployment>.convex.site/stripe/webhook`.
  The whsec is the same as the shared dev one and was copied over.
- The RevenueCat sandbox webhook only reaches `cool-kiwi-961`. Ask Reed to test
  flows that depend on it from the main checkout after merge.

## 2. Metro: own port

Start Metro with `preview_start` `{name: "metro"}`. `launch.json` has
`autoPort: true`, so it gets a free port when another worktree holds 8081.
Note the port from the result; call it `<port>`.

## 3. Simulator: own device

First tidy up after other sessions. This deletes sims whose worktree is gone
or whose branch is merged with nothing uncommitted, and shuts down other idle
ones. It never touches your own sim or one in use (Metro or a build running,
or booted in the last 30 min). It also deletes Xcode DerivedData whose checkout
is gone, simulators whose runtime is gone, and cached builds beyond the newest 3:

```bash
scripts/sims-clean.sh <name>
```

Then use an iOS 27 iPhone 17 Pro named `Ante · <name>`:

```bash
udid=$(xcrun simctl list devices | grep -F "Ante · <name> (" | grep -oE '[0-9A-F-]{36}' | head -1)
[ -n "$udid" ] || udid=$(xcrun simctl create "Ante · <name>" \
  com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro com.apple.CoreSimulator.SimRuntime.iOS-27-0)
xcrun simctl boot "$udid" 2>/dev/null; echo "$udid"
```

- Pass this UDID as `device` to every iOS simulator MCP call (`attach`,
  `screenshot`, `tap`, …).
- Always boot with `simctl boot` directly. Never let `expo run:ios` boot a
  simulator: on Xcode 27 that wedges CoreSimulator.
- From a worktree, **never** touch `948E5A44…` (the main checkout's) or another
  `Ante · *` device, except through `scripts/sims-clean.sh`.
- If your sim was shut down while you were away, the `simctl boot` above brings
  it back with its app and data intact.

## 4. App: reuse a cached build when native code is unchanged

Builds are cached by native fingerprint in `~/Library/Caches/ante-dev/builds/`,
so a feature that only changes JS reuses someone else's build:

```bash
fp=$(bunx fingerprint fingerprint:generate --platform ios 2>/dev/null | jq -r .hash)
app=~/Library/Caches/ante-dev/builds/$fp/Ante.app
ls -d "$app" 2>/dev/null && touch "$(dirname "$app")" || echo "no cached build for $fp"
```

The `touch` marks the build as recently used, so `sims-clean.sh` keeps it.

**Cache miss** (new native deps, `app.config.ts`, `plugins/`, `patches/`), so
build once in this worktree and add the result to the cache (takes about 10 minutes):

```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 && bunx expo run:ios --device "$udid" --no-bundler
for d in ~/Library/Developer/Xcode/DerivedData/Ante-*; do
  [ "$(/usr/libexec/PlistBuddy -c 'Print :WorkspacePath' "$d/info.plist" 2>/dev/null)" = "$PWD/ios/Ante.xcworkspace" ] \
    && built="$d/Build/Products/Debug-iphonesimulator/Ante.app"
done
mkdir -p "$(dirname "$app")" && rm -rf "$app" && cp -R "$built" "$app"
```

The UTF-8 locale matters: without it, `pod install` fails but still exits 0.

**Install, launch and point the dev client at your Metro:**

```bash
xcrun simctl install "$udid" "$app"
xcrun simctl launch "$udid" com.useanteapp.ante
xcrun simctl openurl "$udid" "ante://expo-development-client/?url=http%3A%2F%2Flocalhost%3A<port>"
```

A **fresh simulator** shows two one-time prompts. Handle them with the simulator
MCP, then take a screenshot to verify:
1. The iOS alert "Open in "Ante"?": tap **Open**.
2. The dev-menu intro sheet: tap **Continue**, then swipe the sheet down to dismiss it.

Notes:
- The app's dev menu shows its runtime version, which is the fingerprint. It
  should match `$fp`.
- `.gitignore` is one of the fingerprint's inputs. Editing it forces a new
  native build here, and a full EAS build instead of an OTA update after merge.

## 5. Before opening a PR

1. Sync with main using the desktop `sync_with_base_branch` tool. Outside the
   desktop app, run `git fetch origin && git merge origin/main`. Resolve conflicts:
   - `convex/_generated/*`: take either side, then run `bunx convex dev --once` to regenerate.
   - `bun.lock`: take main's version, then run `bun install`.
   - `convex/schema.ts`: merge by hand, keeping both sides' tables and indexes.
     Then run `bunx convex dev --once`.
2. Run `bun run lint`, `bun run typecheck` and `bun run test`.
3. Keep the PR to this one feature.

## 6. Housekeeping

- When Reed says the feature is done or merged, delete your simulator:
  `xcrun simctl shutdown "$udid"; xcrun simctl delete "$udid"`.
- Other sessions' leftover sims and build files are handled by
  `scripts/sims-clean.sh` at every setup (step 3). Reed can also run it any
  time from any checkout (`--dry-run` to preview).
- The desktop app removes a worktree only once every session that used it is
  archived. Auto-archive is on, so that happens after the PR merges.
- The Convex deployment expires on its own after 5 days. Don't delete other sessions' resources.

## Never, from a worktree

- Run `convex deploy`. Production and shared dev deploy through CI only.
- Run a mutating Convex command (`dev`, `run`, `import`, `env set`) while
  `.env.local` points at `cool-kiwi-961` or prod `whimsical-labrador-585`.
  A PreToolUse hook (`.claude/hooks/guard-convex.sh`) blocks this. If it fires,
  do step 1.
- Drive, install onto or shut down a simulator that isn't `Ante · <name>`
  (`scripts/sims-clean.sh` is the one exception).
