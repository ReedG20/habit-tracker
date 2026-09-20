import type { ReactElement } from 'react';

/** Stripe's React Native SDK has no web build; stakes are hidden on web. */
export function StripeProvider({ children }: { children: ReactElement }) {
  return children;
}
