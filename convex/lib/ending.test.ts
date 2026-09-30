import { describe, expect, test } from 'vitest';

import type { Id } from '../_generated/dataModel';
import { endingPlan, noticeLastDay } from './ending';
import type { CheckedHabit } from './lockout';

// 2026-09-21 is a Monday.
function habit(fields: Partial<CheckedHabit> = {}): CheckedHabit {
  return { _id: 'habit1' as Id<'habits'>, title: 'Run', timesPerWeek: 7, ...fields };
}

const plan = (fields: Partial<CheckedHabit>, today: string, stakeLive = true) =>
  endingPlan({ habit: habit(fields), stakeLive, today, accountableFrom: '2026-09-01' });

describe('noticeLastDay', () => {
  test('a daily habit counts for a week, today included', () => {
    expect(noticeLastDay(habit(), '2026-09-22')).toBe('2026-09-28');
  });

  test('a weekly habit ends on the Sunday nearest a week out', () => {
    const weekly = habit({ timesPerWeek: 3 });
    // Monday through Thursday: this Sunday.
    expect(noticeLastDay(weekly, '2026-09-21')).toBe('2026-09-27');
    expect(noticeLastDay(weekly, '2026-09-24')).toBe('2026-09-27');
    // Friday through Sunday: next Sunday.
    expect(noticeLastDay(weekly, '2026-09-25')).toBe('2026-10-04');
    expect(noticeLastDay(weekly, '2026-09-27')).toBe('2026-10-04');
  });
});

describe('endingPlan', () => {
  test('a live stake means a week’s notice', () => {
    expect(plan({ startDay: '2026-09-10' }, '2026-09-22')).toEqual({
      kind: 'notice',
      lastDay: '2026-09-28',
    });
  });

  test('nothing live on the line ends it right away', () => {
    expect(plan({ startDay: '2026-09-10' }, '2026-09-22', false)).toEqual({
      kind: 'now',
      reason: 'nothing-on-the-line',
    });
    expect(plan({ startDay: '2026-09-10', brokenAt: 1 }, '2026-09-22')).toEqual({
      kind: 'now',
      reason: 'nothing-on-the-line',
    });
  });

  test('a habit that has not started counting ends right away', () => {
    // Made today: today is free.
    expect(plan({ startDay: '2026-09-22' }, '2026-09-22')).toEqual({
      kind: 'now',
      reason: 'not-started',
    });
    // Weekly, made midweek: its first full week hasn't begun.
    expect(plan({ startDay: '2026-09-23', timesPerWeek: 3 }, '2026-09-26')).toEqual({
      kind: 'now',
      reason: 'not-started',
    });
    expect(plan({ startDay: '2026-09-23', timesPerWeek: 3 }, '2026-09-28')).toEqual({
      kind: 'notice',
      lastDay: '2026-10-04',
    });
  });
});
