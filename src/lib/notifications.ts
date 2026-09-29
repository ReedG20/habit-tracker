import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';

/**
 * The device side of deadline reminders: whether iOS lets Ante notify, the
 * Expo push token the backend sends to (`convex/push.ts`), what a push does
 * while the app is open, and where tapping one goes.
 */

export type PushPermission = 'granted' | 'provisional' | 'denied' | 'undetermined';

/** What a push carries in `data`, as set by `convex/reminders.ts` and `convex/lib/notify.ts`. */
export type PushData = {
  /** `timer` is the app's own local notification when a timer is cut short (`use-proof-timer.ts`). */
  kind?: 'reminder' | 'lineup' | 'proof' | 'receipt' | 'account' | 'test' | 'timer';
  /** The habit a `timer` notification is about. */
  habitId?: string;
  url?: string;
  final?: boolean;
  /** A stake that came due; opens its loss screen. */
  lossStakeId?: string;
};

export const notificationsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

const TOKEN_KEY = 'expoPushToken';

// `null` until the first read answers.
let permission: PushPermission | null = null;
const listeners = new Set<() => void>();

function setPermission(next: PushPermission) {
  if (next === permission) return;
  permission = next;
  listeners.forEach((listener) => listener());
}

function toPermission(response: Notifications.NotificationPermissionsStatus): PushPermission {
  const ios = response.ios?.status;
  if (
    ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    ios === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'provisional';
  }
  if (response.granted) return 'granted';
  if (response.status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export function canNotify(value: PushPermission | null): boolean {
  return value === 'granted' || value === 'provisional';
}

/** Re-reads the permission; the user can change it in Settings at any time. */
export async function refreshPermission(): Promise<PushPermission> {
  if (!notificationsSupported) {
    setPermission('denied');
    return 'denied';
  }
  const next = toPermission(await Notifications.getPermissionsAsync());
  setPermission(next);
  return next;
}

/**
 * Asks iOS once; after a "Don't Allow" only Settings can change it, so a
 * second ask opens Settings instead of doing nothing.
 */
export async function requestPermission(): Promise<PushPermission> {
  if (!notificationsSupported) return 'denied';
  const current = await refreshPermission();
  if (current === 'denied') {
    await Linking.openSettings();
    return current;
  }
  const next = toPermission(
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    }),
  );
  setPermission(next);
  return next;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The last known permission, or `null` before the first read. Kept fresh by `useNotifications`. */
export function useNotificationPermission(): PushPermission | null {
  return useSyncExternalStore(subscribe, () => permission);
}

export function storedPushToken(): string | null {
  try {
    return SecureStore.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * This device's Expo push token, once iOS lets Ante notify. Kept, so a device
 * that later turns notifications off can still tell the backend to stop.
 */
export async function currentPushToken(): Promise<string | null> {
  if (!notificationsSupported) return null;
  if (!canNotify(permission)) return storedPushToken();

  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string') return storedPushToken();
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (data !== storedPushToken()) SecureStore.setItem(TOKEN_KEY, data);
    return data;
  } catch (error: unknown) {
    // No network, or no APNs on this device: try again on the next foreground.
    console.warn('Could not get a push token', error);
    return storedPushToken();
  }
}

/**
 * What a push does while Ante is open. Early nudges and photo verdicts stay
 * quiet (the screen and the toasts already say it); a last call still shows,
 * since the app being open doesn't mean they've seen that screen. Receipts and
 * account notices (trial ending) always show: they're about
 * money, and hiding one leaves no trace of it in Notification Center. Never badges.
 */
export function configureForegroundHandling() {
  if (!notificationsSupported) return;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as PushData;
      const show =
        data.kind === 'test' ||
        data.kind === 'receipt' ||
        data.kind === 'account' ||
        (data.kind === 'reminder' && data.final === true);
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * Clears delivered reminders once the app is open: whatever they said is on
 * screen now, and the next one comes if it's still open.
 */
export async function clearDeliveredReminders(): Promise<void> {
  if (!notificationsSupported) return;
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented
      .filter((notification) => {
        const { kind } = notification.request.content.data as PushData;
        return kind === 'reminder' || kind === 'lineup';
      })
      .map((notification) =>
        Notifications.dismissNotificationAsync(notification.request.identifier),
      ),
  );
}

/** Where a tapped push goes: a stake that came due opens its loss screen. */
export function routeForPush(data: PushData): string {
  if (typeof data.lossStakeId === 'string' && /^[a-z0-9]+$/.test(data.lossStakeId)) {
    return `/lost/${data.lossStakeId}`;
  }
  return typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
}
