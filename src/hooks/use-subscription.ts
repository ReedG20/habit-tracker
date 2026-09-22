import { useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import type { CustomerInfo } from 'react-native-purchases';

import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
import { isSubscriptionActive } from '@/convex/lib/entitlements';
import type { SubscriptionSummary } from '@/data/subscription';
import {
  PRO_ENTITLEMENT,
  hasPro,
  revenueCatSupported,
  subscribeCustomerInfo,
} from '@/lib/revenuecat';

import { useNow } from './use-now';

export type Subscription = {
  isPro: boolean;
  /** Which source says so; `null` when neither does. */
  source: 'convex' | 'revenuecat' | null;
  /** The Convex mirror; `undefined` while loading, `null` when there is none. */
  subscription: Doc<'subscriptions'> | null | undefined;
  /** The SDK's view; `null` until the first fetch, or where the SDK cannot run. */
  customerInfo: CustomerInfo | null;
  /** What to display, from whichever source is active; the Convex row wins. */
  summary: SubscriptionSummary | null;
  isLoading: boolean;
};

/**
 * Pro from both ends: the Convex row is what the server enforces, but it
 * trails a purchase by however long the webhook takes, so RevenueCat's own
 * CustomerInfo covers the gap and the UI flips the moment Apple confirms.
 */
export function useSubscription(): Subscription {
  const subscription = useQuery(api.subscriptions.current);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const now = useNow();

  useEffect(() => subscribeCustomerInfo(setCustomerInfo), []);

  const convexActive = subscription != null && isSubscriptionActive(subscription, now);
  const revenueCatActive = hasPro(customerInfo);

  let source: Subscription['source'] = null;
  if (convexActive) source = 'convex';
  else if (revenueCatActive) source = 'revenuecat';

  return {
    isPro: source !== null,
    source,
    subscription,
    customerInfo,
    summary: summarize(subscription, customerInfo, now),
    isLoading: subscription === undefined && customerInfo === null && revenueCatSupported,
  };
}

function summarize(
  subscription: Doc<'subscriptions'> | null | undefined,
  customerInfo: CustomerInfo | null,
  now: number,
): SubscriptionSummary | null {
  if (subscription != null && isSubscriptionActive(subscription, now)) {
    return subscription;
  }

  const entitlement = customerInfo?.entitlements.active[PRO_ENTITLEMENT];
  if (entitlement !== undefined) {
    return {
      status: entitlement.periodType === 'TRIAL' ? 'trial' : 'active',
      expiresAt: entitlement.expirationDateMillis ?? undefined,
      willRenew: entitlement.willRenew,
    };
  }

  // Neither source is active; the row still explains why (expired, cancelled).
  return subscription ?? null;
}
