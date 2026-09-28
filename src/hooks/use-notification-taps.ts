import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { routeForPush, type PushData } from '@/lib/notifications';

/**
 * Opens the screen a tapped push points at, including a push that launched
 * the app cold. Waits for `ready` (signed in, past onboarding) so there is a
 * navigator to push onto, and handles each push once.
 */
export function useNotificationTaps({ ready, locked }: { ready: boolean; locked: boolean }) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || response == null) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { identifier } = response.notification.request;
    if (handled.current === identifier) return;
    handled.current = identifier;

    const data = response.notification.request.content.data as PushData;
    router.push(routeForPush(data, locked) as Href);
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [ready, response, locked]);
}
