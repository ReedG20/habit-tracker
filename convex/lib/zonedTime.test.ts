import { describe, expect, test } from 'vitest';

import { habitDay, localClock, nextDayEnd, zonedDay, zonedInstant } from './zonedTime';

const iso = (at: number) => new Date(at).toISOString();

describe('habitDay', () => {
  test('the small hours belong to the day before', () => {
    // 1:30 AM in Chicago on the 22nd is still the 21st's day.
    expect(habitDay(Date.parse('2026-09-22T06:30:00Z'), 'America/Chicago')).toBe('2026-09-21');
    expect(zonedDay(Date.parse('2026-09-22T06:30:00Z'), 'America/Chicago')).toBe('2026-09-22');
    // 3:00 AM starts the new one.
    expect(habitDay(Date.parse('2026-09-22T08:00:00Z'), 'America/Chicago')).toBe('2026-09-22');
    expect(habitDay(Date.parse('2026-09-22T07:59:00Z'), 'America/Chicago')).toBe('2026-09-21');
  });

  test('crosses a month and a year', () => {
    expect(habitDay(Date.parse('2027-01-01T01:00:00Z'), 'UTC')).toBe('2026-12-31');
  });

  test('the repeated hour of a fall-back night stays in the old day', () => {
    // Berlin falls back at 3:00 CEST on 2026-10-25, to 2:00 CET.
    expect(habitDay(Date.parse('2026-10-25T00:30:00Z'), 'Europe/Berlin')).toBe('2026-10-24');
    expect(habitDay(Date.parse('2026-10-25T01:30:00Z'), 'Europe/Berlin')).toBe('2026-10-24');
    expect(habitDay(Date.parse('2026-10-25T02:00:00Z'), 'Europe/Berlin')).toBe('2026-10-25');
  });
});

describe('nextDayEnd', () => {
  test('is 3 AM local after the current day', () => {
    const now = Date.parse('2026-09-21T15:00:00Z');
    expect(iso(nextDayEnd(now, 'UTC'))).toBe('2026-09-22T03:00:00.000Z');
    // Chicago is UTC-5 in September.
    expect(iso(nextDayEnd(now, 'America/Chicago'))).toBe('2026-09-22T08:00:00.000Z');
    // Kolkata is UTC+5:30, so it's 8:30 PM there.
    expect(iso(nextDayEnd(now, 'Asia/Kolkata'))).toBe('2026-09-21T21:30:00.000Z');
    // Chatham is UTC+12:45 in September (daylight time): 3:45 AM on the 22nd,
    // so that day has just begun.
    expect(iso(nextDayEnd(now, 'Pacific/Chatham'))).toBe('2026-09-22T14:15:00.000Z');
  });

  test('after midnight, the day still running ends at 3 AM tonight', () => {
    // 1 AM in UTC: yesterday's day ends in two hours.
    const now = Date.parse('2026-09-22T01:00:00Z');
    expect(iso(nextDayEnd(now, 'UTC'))).toBe('2026-09-22T03:00:00.000Z');
  });

  test('handles the 23 and 25 hour days around DST', () => {
    // New York springs forward on 2026-03-08 and falls back on 2026-11-01.
    const spring = Date.parse('2026-03-08T12:00:00Z');
    expect(iso(nextDayEnd(spring, 'America/New_York'))).toBe('2026-03-09T07:00:00.000Z');
    const fall = Date.parse('2026-11-01T12:00:00Z');
    expect(iso(nextDayEnd(fall, 'America/New_York'))).toBe('2026-11-02T08:00:00.000Z');
    // The spring-forward night itself: 2 AM jumps to 3 AM, so the day ends then.
    const night = Date.parse('2026-03-08T05:00:00Z');
    expect(iso(nextDayEnd(night, 'America/New_York'))).toBe('2026-03-08T07:00:00.000Z');
  });

  test('Lord Howe’s half-hour DST', () => {
    // Lord Howe moves from +10:30 to +11 on 2026-10-04 at 2 AM.
    const now = Date.parse('2026-10-04T05:00:00Z');
    const next = nextDayEnd(now, 'Australia/Lord_Howe');
    expect(iso(next)).toBe('2026-10-04T16:00:00.000Z');
  });
});

describe('zonedInstant', () => {
  test('places a wall-clock time in the zone', () => {
    expect(iso(zonedInstant('2026-09-21', 8, 30, 'America/Chicago'))).toBe(
      '2026-09-21T13:30:00.000Z',
    );
    expect(iso(zonedInstant('2026-09-21', 21, 30, 'Asia/Kolkata'))).toBe(
      '2026-09-21T16:00:00.000Z',
    );
    // Either side of New York's fall-back.
    expect(iso(zonedInstant('2026-11-01', 8, 0, 'America/New_York'))).toBe(
      '2026-11-01T13:00:00.000Z',
    );
    expect(iso(zonedInstant('2026-10-31', 21, 30, 'America/New_York'))).toBe(
      '2026-11-01T01:30:00.000Z',
    );
  });

  test('round-trips through the local clock', () => {
    const at = zonedInstant('2026-03-09', 8, 0, 'America/New_York');
    expect(zonedDay(at, 'America/New_York')).toBe('2026-03-09');
    expect(localClock(at, 'America/New_York')).toBe(8 * 60);
  });
});
