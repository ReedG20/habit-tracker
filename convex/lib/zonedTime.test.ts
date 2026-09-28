import { describe, expect, test } from 'vitest';

import { localClock, nextLocalMidnight, zonedDay, zonedInstant } from './zonedTime';

const iso = (at: number) => new Date(at).toISOString();

describe('nextLocalMidnight', () => {
  test('is the start of the next local day', () => {
    const now = Date.parse('2026-09-21T15:00:00Z');
    expect(iso(nextLocalMidnight(now, 'UTC'))).toBe('2026-09-22T00:00:00.000Z');
    // Chicago is UTC-5 in September.
    expect(iso(nextLocalMidnight(now, 'America/Chicago'))).toBe('2026-09-22T05:00:00.000Z');
    // Kolkata is UTC+5:30, so it's already 8:30 PM there.
    expect(iso(nextLocalMidnight(now, 'Asia/Kolkata'))).toBe('2026-09-21T18:30:00.000Z');
    // Chatham is UTC+12:45 in September (daylight time).
    expect(iso(nextLocalMidnight(now, 'Pacific/Chatham'))).toBe('2026-09-22T11:15:00.000Z');
  });

  test('handles the 23 and 25 hour days around DST', () => {
    // New York springs forward on 2026-03-08 and falls back on 2026-11-01.
    const spring = Date.parse('2026-03-08T12:00:00Z');
    expect(iso(nextLocalMidnight(spring, 'America/New_York'))).toBe('2026-03-09T04:00:00.000Z');
    const fall = Date.parse('2026-11-01T12:00:00Z');
    expect(iso(nextLocalMidnight(fall, 'America/New_York'))).toBe('2026-11-02T05:00:00.000Z');
  });

  test('finds the day change where midnight itself is skipped', () => {
    // Havana springs forward at 00:00 on 2026-03-08, straight to 01:00.
    const now = Date.parse('2026-03-07T20:00:00Z');
    const next = nextLocalMidnight(now, 'America/Havana');
    expect(zonedDay(next, 'America/Havana')).toBe('2026-03-08');
    expect(zonedDay(next - 60_000, 'America/Havana')).toBe('2026-03-07');
  });

  test('Lord Howe’s half-hour DST', () => {
    // Lord Howe moves from +10:30 to +11 on 2026-10-04 at 2 AM.
    const now = Date.parse('2026-10-04T05:00:00Z');
    const next = nextLocalMidnight(now, 'Australia/Lord_Howe');
    expect(iso(next)).toBe('2026-10-04T13:00:00.000Z');
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
