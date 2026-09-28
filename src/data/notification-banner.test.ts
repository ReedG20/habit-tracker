import { describe, expect, test } from 'vitest';

import {
  BANNER_SNOOZE_MS,
  notificationsBannerCopy,
  shouldShowNotificationsBanner,
} from './notification-banner';

const HOUR = 60 * 60 * 1000;
const now = Date.parse('2026-09-21T12:00:00Z');

describe('shouldShowNotificationsBanner', () => {
  const base = {
    permission: 'denied' as const,
    nextDeadline: now + 48 * HOUR,
    snoozedUntil: null,
    now,
  };

  test('only when notifications are off and something is open', () => {
    expect(shouldShowNotificationsBanner(base)).toBe(true);
    expect(shouldShowNotificationsBanner({ ...base, permission: 'undetermined' })).toBe(true);
    expect(shouldShowNotificationsBanner({ ...base, permission: 'granted' })).toBe(false);
    expect(shouldShowNotificationsBanner({ ...base, permission: 'provisional' })).toBe(false);
    // Unknown yet: don't flash it on launch.
    expect(shouldShowNotificationsBanner({ ...base, permission: null })).toBe(false);
    expect(shouldShowNotificationsBanner({ ...base, nextDeadline: null })).toBe(false);
  });

  test('a dismissal holds, until a deadline is under a day away', () => {
    const snoozed = { ...base, snoozedUntil: now + BANNER_SNOOZE_MS };
    expect(shouldShowNotificationsBanner(snoozed)).toBe(false);
    expect(shouldShowNotificationsBanner({ ...snoozed, nextDeadline: now + 5 * HOUR })).toBe(true);
    expect(shouldShowNotificationsBanner({ ...snoozed, now: now + BANNER_SNOOZE_MS })).toBe(true);
  });
});

describe('notificationsBannerCopy', () => {
  test('leads with the money when there is some', () => {
    const copy = notificationsBannerCopy({
      permission: 'denied',
      stakedGoal: { title: 'Essay', amountCents: 2500 },
      hasHabits: true,
    });
    expect(copy.body).toBe('$25 is riding on Essay. We can’t warn you before a deadline.');
    expect(copy.action).toBe('Open Settings');
  });

  test('asks first when iOS has never been asked', () => {
    const copy = notificationsBannerCopy({
      permission: 'undetermined',
      stakedGoal: null,
      hasHabits: true,
    });
    expect(copy.title).toBe('Want a heads-up?');
    expect(copy.body).toMatch(/^Miss a day and Ante locks\./);
    expect(copy.action).toBe('Turn on');
  });
});
