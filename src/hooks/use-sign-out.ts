import { useClerk } from '@clerk/expo';
import { useMutation } from 'convex/react';
import * as Notifications from 'expo-notifications';
import { useCallback } from 'react';

import { api } from '@/convex/_generated/api';
import { resetAnalytics, track } from '@/lib/analytics';
import { notificationsSupported, storedPushToken } from '@/lib/notifications';

/** Past this, signing out goes ahead: the next person to sign in takes the token over anyway. */
const UNREGISTER_TIMEOUT_MS = 2000;

/**
 * Signs out, first telling the backend to stop pushing to this phone, so
 * whoever uses it next never sees someone else's deadlines. It has to happen
 * before `signOut`: afterwards there is no identity to make the call with.
 * Analytics goes back to an anonymous device for the same reason.
 */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useClerk();
  const unregister = useMutation(api.push.unregister);

  return useCallback(async () => {
    const token = storedPushToken();
    if (token !== null) {
      await Promise.race([
        unregister({ token }).catch((error: unknown) => {
          console.warn('Could not unregister this device', error);
        }),
        new Promise((resolve) => setTimeout(resolve, UNREGISTER_TIMEOUT_MS)),
      ]);
    }
    if (notificationsSupported) {
      await Notifications.dismissAllNotificationsAsync().catch(() => {});
    }
    track('signed out');
    // Before `signOut`: the sign-in screen it lands on is the next person's, not this one's.
    resetAnalytics();
    await signOut();
  }, [signOut, unregister]);
}
