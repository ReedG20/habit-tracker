import { ConvexError } from 'convex/values';
import * as Updates from 'expo-updates';
import PostHog from 'posthog-react-native';

import type { AnalyticsEvents } from './analytics-events';

export type { AnalyticsEvents } from './analytics-events';

// A project token, not a secret: it can only send events, and it ships inside
// every bundle anyway. One project serves every environment; `app_env` tells
// them apart and the project's test-account filter hides development and preview.
const POSTHOG_TOKEN = 'phc_AQFEJFeTEBArEMufaAW7YewDnH9U4nH77CKjW3K7UgXa';
const POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * `development` for a debug build, otherwise the EAS Update channel the build
 * listens on (`preview` or `production`, from eas.json).
 */
export const appEnv: string = __DEV__ ? 'development' : (Updates.channel ?? 'unknown');

// Stamped on in `before_send` rather than registered as super properties:
// registering is async, so the first lifecycle events would go out without
// them. Native-only events (crashes, rage taps) never pass through here.
const environmentProperties = {
  app_env: appEnv,
  // Which OTA bundle is running, so a regression can be pinned to an update.
  update_id: Updates.updateId ?? 'embedded',
};

export const posthog = new PostHog(POSTHOG_TOKEN, {
  host: POSTHOG_HOST,
  before_send: (event) =>
    event === null
      ? null
      : { ...event, properties: { ...event.properties, ...environmentProperties } },
  captureAppLifecycleEvents: true,
  // Off in development: recordings count against the replay quota, and a
  // simulator session is never worth watching.
  enableSessionReplay: appEnv !== 'development',
  sessionReplayConfig: {
    // Habit names, proof notes, friends' emails and proof photos stay out of
    // recordings. Both default to true; spelled out so nobody flips them casually.
    maskAllTextInputs: true,
    maskAllImages: true,
  },
  errorTracking: {
    autocapture: {
      uncaughtExceptions: true,
      unhandledRejections: true,
      nativeCrashes: true,
    },
  },
});

/** Records a product event; the name and properties are checked against `AnalyticsEvents`. */
export function track<E extends keyof AnalyticsEvents>(
  event: E,
  ...[properties]: AnalyticsEvents[E] extends undefined ? [] : [AnalyticsEvents[E]]
): void {
  posthog.capture(event, properties);
}

/**
 * Ties this device's events to `userId` (our `users._id`, the same id
 * RevenueCat uses), merging what was captured anonymously before sign-in.
 */
export function identifyUser(userId: string, properties: { email?: string }): void {
  posthog.identify(userId, properties.email ? { $set: { email: properties.email } } : undefined);
}

/** Back to an anonymous device, so whoever signs in next starts clean. */
export function resetAnalytics(): void {
  posthog.reset();
}

/**
 * Reports a failure the app caught and showed the user, which autocapture
 * never sees. `where` names the flow, so issues group by what broke. A
 * `ConvexError` is the server refusing on purpose ("pick someone other than
 * yourself"), not a bug, so it stays out of error tracking.
 */
export function captureError(error: unknown, where: string): void {
  if (error instanceof ConvexError) return;
  posthog.captureException(error, { where });
}

/** Records a screen view; `name` is the route pattern, not the concrete URL. */
export function trackScreen(name: string, pathname: string): void {
  void posthog.screen(name, { pathname });
}
