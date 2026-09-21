import { describe, expect, test } from 'vitest';

import { daysBefore, previousDay, streakLength } from './days';

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
