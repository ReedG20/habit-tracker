import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { openKept } from '@/lib/kept-screen';
import { openLoss } from '@/lib/loss-screen';
import { openMilestone } from '@/lib/milestone-screen';
import {
  keptOfPush,
  lossOfPush,
  milestoneOfPush,
  routeForPush,
  type PushData,
} from '@/lib/notifications';
import { isProofOpen } from '@/lib/proof-watch';

/**
 * Opens the screen a tapped push points at, including a push that launched
 * the app cold. Waits for `ready` (signed in, past onboarding) so there is a
 * navigator to push onto, and handles each push once.
 */
export function useNotificationTaps({ ready }: { ready: boolean }) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || response == null) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { identifier } = response.notification.request;
    if (handled.current === identifier) return;
    handled.current = identifier;

    const data = response.notification.request.content.data as PushData;
    const lossId = lossOfPush(data);
    // Through `openKept`, so the presenter can't open the same page on top.
    const keptId = keptOfPush(data);
    const milestoneId = milestoneOfPush(data);
    // A stopped timer's prove screen is usually still open, and says so itself.
    const alreadyThere =
      data.kind === 'timer' && data.habitId !== undefined && isProofOpen(data.habitId);
    if (lossId !== null) openLoss(lossId);
    else if (keptId !== null) openKept(keptId);
    else if (milestoneId !== null) openMilestone(milestoneId);
    else if (!alreadyThere) router.push(routeForPush(data) as Href);
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [ready, response]);
}
