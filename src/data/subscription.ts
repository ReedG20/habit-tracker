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
  if (status === 'expired' || ended) return 'Resubscribe';
  if (expiresAt === undefined) return 'Active';

  const date = formatShortDate(expiresAt);
  if (status === 'trial') return willRenew ? `Trial · ${date}` : `Trial · ends ${date}`;
  if (status === 'billing_issue') return `Payment issue · ends ${date}`;
  if (status === 'paused') return `Paused · ${date}`;
  return willRenew ? `Active · renews ${date}` : `Active · ends ${date}`;
}

/**
 * What Me's Pro card says to someone without Pro: a pitch the first time, and
 * a way back for someone whose subscription ran out.
 */
export function proOfferCopy(summary: SubscriptionSummary | null): {
  line: string;
  action: string;
} {
  if (summary === null) {
    return { line: 'Real stakes, proven check-ins, nothing held back.', action: 'Upgrade' };
  }
  return { line: 'Your habits are paused until you’re back.', action: 'Resubscribe' };
}
