/**
 * Keeping installed builds current: the minimum-build gate and when a
 * downloaded OTA update gets applied. Pure, so it can be tested without
 * native modules; the hooks read `expo-application` and `expo-updates`.
 */

/** Opens Ante's listing in the App Store app (the `ascAppId` in `eas.json`). */
export const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6814632907';

/** A CFBundleVersion like `"42"` as a number, or `null` if it isn't a plain build number. */
export function parseBuild(raw: string | null | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/** Fails open: without both numbers there is nothing to enforce. */
export function isBelowMinimum(build: number | null, minimum: number | null): boolean {
  return build !== null && minimum !== null && build < minimum;
}

/** How long the app has to have been away before a downloaded update replaces what's on screen. */
export const AWAY_BEFORE_RELOAD_MS = 15 * 60 * 1000;

/** At most one update check per this long while the app keeps coming back. */
export const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Screens where a reload would throw away something half done: a commitment
 * being written, onboarding, raising stakes, a restart, the paywall.
 */
const MID_FLOW_PREFIXES = ['/new', '/onboarding', '/raise', '/restart', '/pro'];

function isMidFlow(pathname: string): boolean {
  return MID_FLOW_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Whether coming back to the app should apply a downloaded update now. Only
 * after a long enough absence that a fresh start looks like a normal relaunch,
 * and never in the middle of a flow.
 */
export function shouldApplyUpdate({
  pending,
  awayMs,
  pathname,
}: {
  pending: boolean;
  awayMs: number;
  pathname: string;
}): boolean {
  return pending && awayMs >= AWAY_BEFORE_RELOAD_MS && !isMidFlow(pathname);
}
