import { useMutation } from 'convex/react';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { logInRevenueCat, logOutRevenueCat } from '@/lib/revenuecat';

// The signed-in user's id once their row is stored and RevenueCat is logged in
// as them; `null` otherwise. A purchase made before this is set would land on
// an anonymous RevenueCat customer, so the paywall waits for it.
let sessionUserId: Id<'users'> | null = null;
const listeners = new Set<() => void>();

function setSessionUserId(userId: Id<'users'> | null) {
  sessionUserId = userId;
  listeners.forEach((listener) => listener());
}

// RevenueCat logIn / logOut run one at a time, in order. Auth can flicker
// while a session restores, and a logOut that starts while a logIn is still in
// flight sees an anonymous user and fails.
let revenueCatQueue: Promise<void> = Promise.resolve();

function enqueue(operation: () => Promise<void>): Promise<void> {
  revenueCatQueue = revenueCatQueue.then(operation, operation);
  return revenueCatQueue;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSessionUserId(): Id<'users'> | null {
  return useSyncExternalStore(subscribe, () => sessionUserId);
}

/** The device's IANA zone, which the lockout check uses to tell when the user's day ends. */
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * Upserts the `users` row and ties RevenueCat to it whenever someone is signed
 * in. Lives in the root navigator rather than the tabs layout because the
 * onboarding paywall is signed in but outside the tabs. Queries tolerate the
 * user row not existing yet and re-resolve once it lands. Losing the session
 * hands the device back to an anonymous RevenueCat customer.
 *
 * The row also carries the device's time zone. Coming back to the foreground
 * reports it again, so a trip across zones is picked up without a relaunch.
 */
export function useSignedInSession(isAuthenticated: boolean) {
  const storeUser = useMutation(api.users.storeUser);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    storeUser({ timeZone: deviceTimeZone() })
      .then(async (userId) => {
        if (cancelled) return;
        await enqueue(() => logInRevenueCat(userId));
        if (!cancelled) setSessionUserId(userId);
      })
      .catch((error: unknown) => {
        console.error('Failed to store the signed-in user', error);
      });
    // Only writes when the zone actually changed, so this is cheap to repeat.
    const foreground = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      storeUser({ timeZone: deviceTimeZone() }).catch((error: unknown) => {
        console.warn('Failed to report the time zone', error);
      });
    });
    return () => {
      cancelled = true;
      foreground.remove();
      setSessionUserId(null);
      void enqueue(logOutRevenueCat);
    };
  }, [isAuthenticated, storeUser]);
}
