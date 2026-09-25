import { describe, expect, test } from 'vitest';

import {
  countThisWeek,
  dayOfWeek,
  daysBefore,
  daysLeftInWeek,
  previousDay,
  streakLength,
  weekStart,
  weeklyStreak,
} from './days';

describe('previousDay', () => {
  test('steps back within a month', () => {
    expect(previousDay('2026-09-21')).toBe('2026-09-20');
  });

  test('crosses month and year boundaries', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });

  test('handles leap days', () => {
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });
});

describe('daysBefore', () => {
  test('is previousDay for count 1', () => {
    expect(daysBefore('2026-09-21', 1)).toBe(previousDay('2026-09-21'));
  });

  test('spans a long window', () => {
    expect(daysBefore('2026-09-21', 60)).toBe('2026-07-23');
  });
});

describe('streakLength', () => {
  test('is zero with no completions', () => {
    expect(streakLength(new Set(), '2026-09-21')).toBe(0);
  });

  test('counts consecutive days ending today', () => {
    const days = new Set(['2026-09-19', '2026-09-20', '2026-09-21']);
    expect(streakLength(days, '2026-09-21')).toBe(3);
  });

  test('keeps the streak alive when today is not logged yet', () => {
    const days = new Set(['2026-09-19', '2026-09-20']);
    expect(streakLength(days, '2026-09-21')).toBe(2);
  });

  test('breaks on a gap', () => {
    const days = new Set(['2026-09-17', '2026-09-18', '2026-09-20', '2026-09-21']);
    expect(streakLength(days, '2026-09-21')).toBe(2);
  });
});

// 2026-09-21 is a Monday; 2026-09-27 the Sunday that ends its week.
describe('weeks', () => {
  test('run Monday to Sunday', () => {
    expect(dayOfWeek('2026-09-21')).toBe(0);
    expect(dayOfWeek('2026-09-27')).toBe(6);
    expect(weekStart('2026-09-21')).toBe('2026-09-21');
    expect(weekStart('2026-09-27')).toBe('2026-09-21');
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
  });

  test('cross a year boundary', () => {
    expect(dayOfWeek('2026-01-01')).toBe(3);
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
  });

  test('count the days left, today included', () => {
    expect(daysLeftInWeek('2026-09-21')).toBe(7);
    expect(daysLeftInWeek('2026-09-26')).toBe(2);
    expect(daysLeftInWeek('2026-09-27')).toBe(1);
  });

  test('count only this week’s logs up to today', () => {
    const days = new Set(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-25']);
    expect(countThisWeek(days, '2026-09-22')).toBe(2);
    expect(countThisWeek(days, '2026-09-27')).toBe(3);
  });
});

describe('weeklyStreak', () => {
  // Two earlier weeks at 3 logs each, and one log so far this week.
  const base = [
    '2026-09-08',
    '2026-09-10',
    '2026-09-12',
    '2026-09-14',
    '2026-09-16',
    '2026-09-18',
    '2026-09-21',
  ];

  test('is zero with no completions', () => {
    expect(weeklyStreak(new Set(), '2026-09-24', 3)).toBe(0);
  });

  test('keeps the streak alive while this week is still short', () => {
    expect(weeklyStreak(new Set(base), '2026-09-24', 3)).toBe(2);
  });

  test('counts this week once it hits the target', () => {
    const days = new Set([...base, '2026-09-22', '2026-09-23']);
    expect(weeklyStreak(days, '2026-09-24', 3)).toBe(3);
  });

  test('breaks on a week that ended short', () => {
    const days = new Set(base.filter((day) => day !== '2026-09-10'));
    expect(weeklyStreak(days, '2026-09-24', 3)).toBe(1);
  });

  test('counts across a year boundary', () => {
    const days = new Set(['2025-12-23', '2025-12-30', '2026-01-02', '2026-01-05']);
    expect(weeklyStreak(days, '2026-01-06', 1)).toBe(3);
  });
});
