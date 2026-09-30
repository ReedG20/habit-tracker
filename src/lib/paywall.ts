import { router } from 'expo-router';

import type { PaywallSource } from '@/lib/analytics-events';

/**
 * Opens the full-page paywall. `navigate` rather than `push`, so a double tap
 * (or the daily open racing a tap) never stacks two copies.
 */
export function openPaywall(source: PaywallSource): void {
  router.navigate({ pathname: '/pro', params: { source } });
}
