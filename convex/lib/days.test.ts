import { describe, expect, test } from 'vitest';

import {
  countThisWeek,
  dayOfWeek,
  daysBefore,
  daysLeftInWeek,
  previousDay,
  dailyRun,
  streakLength,
  weekEnd,
  weekStart,
  weeklyRun,
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
    expect(weekStart('2026-09-21', 0)).toBe('2026-09-21');
    expect(weekStart('2026-09-27', 0)).toBe('2026-09-21');
    expect(weekStart('2026-09-28', 0)).toBe('2026-09-28');
  });

  test('cross a year boundary', () => {
    expect(dayOfWeek('2026-01-01')).toBe(3);
    expect(weekStart('2026-01-01', 0)).toBe('2025-12-29');
  });

  test('count the days left, today included', () => {
    expect(daysLeftInWeek('2026-09-21', 0)).toBe(7);
    expect(daysLeftInWeek('2026-09-26', 0)).toBe(2);
    expect(daysLeftInWeek('2026-09-27', 0)).toBe(1);
  });

  test('can start on any weekday', () => {
    // A habit made on Thursday 2026-09-24 runs Thursday to Wednesday.
    const thursday = 3;
    expect(weekStart('2026-09-24', thursday)).toBe('2026-09-24');
    expect(weekStart('2026-09-30', thursday)).toBe('2026-09-24');
    expect(weekStart('2026-10-01', thursday)).toBe('2026-10-01');
    expect(weekEnd('2026-09-27', thursday)).toBe('2026-09-30');
    expect(daysLeftInWeek('2026-09-24', thursday)).toBe(7);
    expect(daysLeftInWeek('2026-09-30', thursday)).toBe(1);
  });

  test('count only this week’s logs up to today', () => {
    const days = new Set(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-25']);
    expect(countThisWeek(days, '2026-09-22', 0)).toBe(2);
    expect(countThisWeek(days, '2026-09-27', 0)).toBe(3);
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
    expect(weeklyStreak(new Set(), '2026-09-24', 3, 0)).toBe(0);
  });

  test('keeps the streak alive while this week is still short', () => {
    expect(weeklyStreak(new Set(base), '2026-09-24', 3, 0)).toBe(2);
  });

  test('counts this week once it hits the target', () => {
    const days = new Set([...base, '2026-09-22', '2026-09-23']);
    expect(weeklyStreak(days, '2026-09-24', 3, 0)).toBe(3);
  });

  test('breaks on a week that ended short', () => {
    const days = new Set(base.filter((day) => day !== '2026-09-10'));
    expect(weeklyStreak(days, '2026-09-24', 3, 0)).toBe(1);
  });

  test('groups weeks by the weekday they start on', () => {
    // Thursday-to-Wednesday weeks: 09-17..09-23 has two logs, 09-24..09-30 has two.
    const days = new Set(['2026-09-17', '2026-09-23', '2026-09-24', '2026-09-30']);
    expect(weeklyStreak(days, '2026-09-30', 2, 3)).toBe(2);
    // The same logs in Monday weeks: 09-14..20 one, 09-21..27 two, 09-28.. one.
    expect(weeklyStreak(days, '2026-09-30', 2, 0)).toBe(1);
  });

  test('counts across a year boundary', () => {
    const days = new Set(['2025-12-23', '2025-12-30', '2026-01-02', '2026-01-05']);
    expect(weeklyStreak(days, '2026-01-06', 1, 0)).toBe(3);
  });
});

describe('frozen days', () => {
  test('bridge a daily streak without adding to it', () => {
    const done = new Set(['2026-09-20', '2026-09-21', '2026-09-25']);
    const frozen = new Set(['2026-09-22', '2026-09-23', '2026-09-24']);
    expect(streakLength(done, '2026-09-25')).toBe(1);
    expect(streakLength(done, '2026-09-25', frozen)).toBe(3);
  });

  test('skip a week that touches a freeze', () => {
    // Two weeks met, one frozen between them, and this week met.
    const done = new Set([
      '2026-09-07',
      '2026-09-08',
      '2026-09-14',
      '2026-09-15',
      '2026-09-28',
      '2026-09-29',
    ]);
    const frozen = new Set(['2026-09-23']);
    expect(weeklyStreak(done, '2026-09-29', 2, 0)).toBe(1);
    expect(weeklyStreak(done, '2026-09-29', 2, 0, frozen)).toBe(3);
  });
});

describe('where a run starts', () => {
  test('a daily run ends at the oldest day it walked through, bridged ones included', () => {
    const done = new Set(['2026-09-19', '2026-09-20', '2026-09-21']);
    expect(dailyRun(done, '2026-09-21')).toEqual({ length: 3, earliest: '2026-09-19' });
    expect(dailyRun(done, '2026-09-21', new Set(['2026-09-18']))).toEqual({
      length: 3,
      earliest: '2026-09-18',
    });
  });

  test('a run that never started has no earliest day', () => {
    expect(dailyRun(new Set(), '2026-09-21')).toEqual({ length: 0, earliest: undefined });
    expect(weeklyRun(new Set(), '2026-09-21', 2, 0)).toEqual({ length: 0, earliest: undefined });
  });

  test('a weekly run ends at the first day of its oldest week', () => {
    const done = new Set(['2026-09-08', '2026-09-09', '2026-09-15', '2026-09-16']);
    expect(weeklyRun(done, '2026-09-21', 2, 0)).toEqual({ length: 2, earliest: '2026-09-07' });
  });
});
