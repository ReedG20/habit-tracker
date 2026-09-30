import { describe, expect, test } from 'vitest';

import { shouldAutoPresentPaywall } from './daily-paywall';

const base = {
  today: '2026-09-30',
  lastShownDay: '2026-09-29',
  isPro: false,
  isLoading: false,
  supported: true,
  pathname: '/',
  hasUnseenLoss: false,
  hasUnseenKept: false,
};

describe('shouldAutoPresentPaywall', () => {
  test('once a day without Pro', () => {
    expect(shouldAutoPresentPaywall(base)).toBe(true);
    expect(shouldAutoPresentPaywall({ ...base, lastShownDay: null })).toBe(true);
    expect(shouldAutoPresentPaywall({ ...base, lastShownDay: '2026-09-30' })).toBe(false);
  });

  test('never to a subscriber, or before Pro is known', () => {
    expect(shouldAutoPresentPaywall({ ...base, isPro: true })).toBe(false);
    expect(shouldAutoPresentPaywall({ ...base, isLoading: true })).toBe(false);
  });

  test('not where it can’t sell', () => {
    expect(shouldAutoPresentPaywall({ ...base, supported: false })).toBe(false);
  });

  test('a loss or a keep goes first, and screens that must be answered are left alone', () => {
    expect(shouldAutoPresentPaywall({ ...base, hasUnseenLoss: true })).toBe(false);
    expect(shouldAutoPresentPaywall({ ...base, hasUnseenKept: true })).toBe(false);
    for (const pathname of ['/lost/abc', '/kept/abc', '/new', '/restart/abc', '/pro']) {
      expect(shouldAutoPresentPaywall({ ...base, pathname })).toBe(false);
    }
    expect(shouldAutoPresentPaywall({ ...base, pathname: '/commitments' })).toBe(true);
    expect(shouldAutoPresentPaywall({ ...base, pathname: '/newsletter' })).toBe(true);
  });
});
