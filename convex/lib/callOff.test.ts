import { describe, expect, test } from 'vitest';

import { friendHeadsUpAt, goalCallOffUntil, habitCallOffUntil, isCallOffOpen } from './callOff';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 1, 12);

describe('goalCallOffUntil', () => {
  test.each([
    ['10 minutes', 10 * MINUTE, 5 * MINUTE],
    ['2 hours', 2 * HOUR, 15 * MINUTE],
    ['a day', DAY, 2.4 * HOUR],
    ['3 days', 3 * DAY, 7.2 * HOUR],
    ['a week', 7 * DAY, 16.8 * HOUR],
    ['10 days', 10 * DAY, DAY],
    ['a year', 365 * DAY, DAY],
  ])('a goal %s long can be called off for its share', (_, length, window) => {
    expect(goalCallOffUntil(NOW, NOW + length) - NOW).toBeCloseTo(window);
  });

  test('never reaches the deadline, however short', () => {
    expect(goalCallOffUntil(NOW, NOW + MINUTE)).toBeLessThan(NOW + MINUTE);
    expect(goalCallOffUntil(NOW, NOW)).toBe(NOW);
  });
});

describe('habitCallOffUntil', () => {
  const newYork = 'America/New_York';

  test('runs until day one starts, at 3 AM', () => {
    // 9 PM in New York on Oct 1 is 1 AM UTC on Oct 2; 3 AM there is 7 AM UTC.
    const created = Date.UTC(2026, 9, 2, 1);
    expect(habitCallOffUntil(created, newYork)).toBe(Date.UTC(2026, 9, 2, 7));
  });

  test('gives one made just before the day ends at least 15 minutes', () => {
    const created = Date.UTC(2026, 9, 2, 6, 55); // 2:55 AM in New York
    expect(habitCallOffUntil(created, newYork)).toBe(created + 15 * MINUTE);
  });

  test('just after the day starts, it runs nearly a full day', () => {
    const created = Date.UTC(2026, 9, 2, 7, 5); // 3:05 AM in New York
    expect(habitCallOffUntil(created, newYork)).toBe(Date.UTC(2026, 9, 3, 7));
  });

  test('without a time zone, or with a bad one, only the floor', () => {
    expect(habitCallOffUntil(NOW, undefined)).toBe(NOW + 15 * MINUTE);
    expect(habitCallOffUntil(NOW, 'Not/AZone')).toBe(NOW + 15 * MINUTE);
  });
});

describe('isCallOffOpen', () => {
  test('open until the moment it closes, never without a window', () => {
    expect(isCallOffOpen(NOW + 1, NOW)).toBe(true);
    expect(isCallOffOpen(NOW, NOW)).toBe(false);
    expect(isCallOffOpen(undefined, NOW)).toBe(false);
  });
});

describe('friendHeadsUpAt', () => {
  const chicago = 'America/Chicago';
  // 2026-10-01 is CDT, UTC-5: local = UTC - 5h.
  const local = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour + 5, minute);

  test('a habit made in the afternoon tells the friend at 8 AM, not when the window shuts at 3 AM', () => {
    const made = local(1, 15, 30);
    const callOff = habitCallOffUntil(made, chicago);
    expect(callOff).toBe(local(2, 3));
    expect(friendHeadsUpAt(callOff, made, chicago)).toBe(local(2, 8));
  });

  test('a window closing late in the evening waits for the next morning', () => {
    expect(friendHeadsUpAt(local(1, 22, 30), local(1, 21), chicago)).toBe(local(2, 8));
  });

  test('a window closing in the daytime goes as soon as it closes', () => {
    expect(friendHeadsUpAt(local(1, 14), local(1, 13), chicago)).toBe(local(1, 14));
    expect(friendHeadsUpAt(local(1, 21, 59), local(1, 21), chicago)).toBe(local(1, 21, 59));
  });

  test('with no window, it goes now, whatever the hour', () => {
    expect(friendHeadsUpAt(undefined, local(1, 23), chicago)).toBe(local(1, 23));
  });

  test('a goal’s friend hears before the deadline, even overnight', () => {
    const due = local(2, 6);
    expect(friendHeadsUpAt(local(2, 1), local(1, 23), chicago, due)).toBe(local(2, 1));
    expect(friendHeadsUpAt(local(2, 1), local(1, 23), chicago, local(2, 12))).toBe(local(2, 8));
  });

  test('an unknown zone, or none, keeps the window’s own time', () => {
    expect(friendHeadsUpAt(local(2, 3), local(1, 15), undefined)).toBe(local(2, 3));
    expect(friendHeadsUpAt(local(2, 3), local(1, 15), 'Not/AZone')).toBe(local(2, 3));
  });
});
