/**
 * Without Ante Pro, the paywall opens on its own the first time the app is
 * opened each day. Never over a screen that has to be answered first (a loss,
 * a commitment kept, a contract being signed) or over itself. Pure, so every branch is tested.
 */

export type DailyPaywallInput = {
  today: string;
  /** The day it last opened on its own, or `null` if it never has. */
  lastShownDay: string | null;
  isPro: boolean;
  /** Pro unknown yet: never flash it at a subscriber on launch. */
  isLoading: boolean;
  /** Whether this platform can sell the subscription at all. */
  supported: boolean;
  pathname: string;
  /** A lost stake waiting for its screen; that screen goes first. */
  hasUnseenLoss: boolean;
  /** A commitment seen through waiting for its Kept screen; that goes first too. */
  hasUnseenKept: boolean;
};

const BLOCKING_PATHS = ['/lost', '/kept', '/new', '/restart', '/pro'];

export function shouldAutoPresentPaywall({
  today,
  lastShownDay,
  isPro,
  isLoading,
  supported,
  pathname,
  hasUnseenLoss,
  hasUnseenKept,
}: DailyPaywallInput): boolean {
  if (isPro || isLoading || !supported || hasUnseenLoss || hasUnseenKept) return false;
  if (lastShownDay === today) return false;
  return !BLOCKING_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
