import { describe, expect, test } from 'vitest';

import { describeSubscription } from './subscription';

const NOW = Date.UTC(2026, 8, 21, 12);
const LATER = Date.UTC(2026, 9, 21, 12);
const later = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
  new Date(LATER),
);

describe('describeSubscription', () => {
  test('no subscription invites an upgrade', () => {
    expect(describeSubscription(null, NOW)).toBe('Upgrade');
  });

  test('a renewing trial names the conversion date', () => {
    expect(describeSubscription({ status: 'trial', expiresAt: LATER, willRenew: true }, NOW)).toBe(
      `Trial · ${later}`,
    );
  });

  test('a cancelled subscription still shows the end date', () => {
    expect(
      describeSubscription({ status: 'cancelled', expiresAt: LATER, willRenew: false }, NOW),
    ).toBe(`Active · ends ${later}`);
  });

  test('a renewing subscription shows the renewal date', () => {
    expect(describeSubscription({ status: 'active', expiresAt: LATER, willRenew: true }, NOW)).toBe(
      `Active · renews ${later}`,
    );
  });

  test('a past expiry reads as expired whatever the status says', () => {
    expect(
      describeSubscription({ status: 'cancelled', expiresAt: NOW - 1, willRenew: false }, NOW),
    ).toBe('Expired');
    expect(describeSubscription({ status: 'expired', willRenew: false }, NOW)).toBe('Expired');
  });
});
