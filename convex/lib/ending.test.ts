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

test('a weekly habit ends with one of its own weeks', () => {
  // Made Thursday 2026-09-24: weeks run Thursday to Wednesday.
  const weekly = habit({ timesPerWeek: 3, startDay: '2026-09-24' });
  expect(noticeLastDay(weekly, '2026-09-24')).toBe('2026-09-30');
  expect(noticeLastDay(weekly, '2026-09-28')).toBe('2026-10-07');
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
    // Weekly, with its week under way when the user was let back in on the 25th.
    expect(
      endingPlan({
        habit: habit({ startDay: '2026-09-23', timesPerWeek: 3 }),
        stakeLive: true,
        today: '2026-09-26',
        accountableFrom: '2026-09-26',
      }),
    ).toEqual({ kind: 'now', reason: 'not-started' });
  });

  test('a weekly habit counts from the day it is made, so ending it takes notice', () => {
    // Made Wednesday the 23rd: its week runs to Tuesday the 29th, 4 days out.
    expect(plan({ startDay: '2026-09-23', timesPerWeek: 3 }, '2026-09-26')).toEqual({
      kind: 'notice',
      lastDay: '2026-09-29',
    });
    // On Monday the 28th, the Tuesday nearest a week out: 9 days.
    expect(plan({ startDay: '2026-09-23', timesPerWeek: 3 }, '2026-09-28')).toEqual({
      kind: 'notice',
      lastDay: '2026-10-06',
    });
  });
});

describe('endingPlan with an end date', () => {
  test('an end date sooner than the notice is the last day', () => {
    expect(plan({ endsOn: '2026-09-25' }, '2026-09-22')).toEqual({
      kind: 'notice',
      lastDay: '2026-09-25',
    });
  });

  test('an end date further out leaves the week’s notice as it is', () => {
    expect(plan({ endsOn: '2026-10-30' }, '2026-09-22')).toEqual({
      kind: 'notice',
      lastDay: '2026-09-28',
    });
  });
});
