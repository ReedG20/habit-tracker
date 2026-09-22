import type { Doc } from '@/convex/_generated/dataModel';
import { formatShortDate } from '@/lib/dates';

export type SubscriptionStatus = Doc<'subscriptions'>['status'];

/**
 * The parts of a subscription the UI describes, from either source: the
 * Convex row once the webhook has landed, or RevenueCat's CustomerInfo right
 * after a purchase.
 */
export type SubscriptionSummary = {
  status: SubscriptionStatus;
  expiresAt?: number;
  willRenew: boolean;
};

/** The settings row's trailing text: what the subscription is doing next. */
export function describeSubscription(summary: SubscriptionSummary | null, now: number): string {
  if (summary === null) return 'Upgrade';

  const { status, expiresAt, willRenew } = summary;
  const ended = expiresAt !== undefined && expiresAt <= now;
  if (status === 'expired' || ended) return 'Expired';
  if (expiresAt === undefined) return 'Active';

  const date = formatShortDate(expiresAt);
  if (status === 'trial') return willRenew ? `Trial · ${date}` : `Trial · ends ${date}`;
  if (status === 'billing_issue') return `Payment issue · ends ${date}`;
  if (status === 'paused') return `Paused · ${date}`;
  return willRenew ? `Active · renews ${date}` : `Active · ends ${date}`;
}
