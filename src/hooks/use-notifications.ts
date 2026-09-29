import { useMutation } from 'convex/react';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { api } from '@/convex/_generated/api';
import { useNotificationTaps } from '@/hooks/use-notification-taps';
import { useSessionUserId } from '@/hooks/use-signed-in-session';
import {
  clearDeliveredReminders,
  configureForegroundHandling,
  currentPushToken,
  notificationsSupported,
  refreshPermission,
  useNotificationPermission,
} from '@/lib/notifications';

// Before any push can arrive: iOS asks the handler the moment one lands.
configureForegroundHandling();

/**
 * Keeps this device's reminders wired up. Lives in the root navigator, so it
 * runs whichever screen is up.
 *
 * - Re-reads the permission on launch and each return to the foreground, since
 *   it can change in Settings at any time.
 * - Registers the push token with its permission once the user row exists.
 *   The backend only re-plans when something changed, so repeating is cheap.
 * - Clears delivered reminders on open: the screen says it all now.
 * - Opens the right screen when a push is tapped, once there is a navigator.
 */
export function useNotifications({ ready }: { ready: boolean }) {
  const register = useMutation(api.push.register);
  const userId = useSessionUserId();
  const permission = useNotificationPermission();

  useEffect(() => {
    if (!notificationsSupported) return;
    const onForeground = () => {
      void refreshPermission().catch((error: unknown) => {
        console.warn('Could not read the notification permission', error);
      });
      void clearDeliveredReminders().catch(() => {});
    };
    onForeground();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') onForeground();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!notificationsSupported || userId === null || permission === null) return;
    let cancelled = false;
    const sync = async () => {
      const token = await currentPushToken();
      if (token === null || cancelled) return;
      await register({ token, permission });
    };
    const syncQuietly = () => {
      sync().catch((error: unknown) => {
        console.warn('Could not register for reminders', error);
      });
    };
    syncQuietly();
    // A token can rotate; the next foreground reports the new one.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncQuietly();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [userId, permission, register]);

  useNotificationTaps({ ready });
}
