import type { AnalyticsEvents } from './analytics-events';

export type { AnalyticsEvents } from './analytics-events';

/** No analytics on web: the replay and crash plugins are native-only, and web isn't shipped. */
export const appEnv = 'web';

export function track<E extends keyof AnalyticsEvents>(
  _event: E,
  ..._properties: AnalyticsEvents[E] extends undefined ? [] : [AnalyticsEvents[E]]
): void {}

export function identifyUser(_userId: string, _properties: { email?: string }): void {}

export function resetAnalytics(): void {}

export function captureError(_error: unknown, _where: string): void {}

export function trackScreen(_name: string, _pathname: string): void {}
