import { describe, expect, test } from 'vitest';

import {
  endDayAfterWeeks,
  endDayLabel,
  lastCountedDay,
  restartableBefore,
  snapEndDay,
  validEndDay,
} from './endDate';

// 2026-09-21 is a Monday.
const daily = { timesPerWeek: 7, startDay: '2026-09-21' };
const weekly = { timesPerWeek: 3, startDay: '2026-09-21' };

describe('lastCountedDay', () => {
  test('runs until ended without either', () => {
    expect(lastCountedDay({})).toBeUndefined();
  });

  test('is whichever comes first of the end date and the notice', () => {
    expect(lastCountedDay({ endsOn: '2026-10-30' })).toBe('2026-10-30');
    expect(lastCountedDay({ endsAfter: '2026-09-28' })).toBe('2026-09-28');
    expect(lastCountedDay({ endsOn: '2026-10-30', endsAfter: '2026-09-28' })).toBe('2026-09-28');
    expect(lastCountedDay({ endsOn: '2026-09-25', endsAfter: '2026-09-28' })).toBe('2026-09-25');
  });
});

describe('endDayAfterWeeks', () => {
  test('a daily habit counts from tomorrow, so two weeks is 14 counted days', () => {
    expect(endDayAfterWeeks(daily, 2)).toBe('2026-10-05');
  });

  test('a weekly habit counts from today, so two weeks ends on its second week’s last day', () => {
    expect(endDayAfterWeeks(weekly, 2)).toBe('2026-10-04');
  });
});

describe('snapEndDay', () => {
  test('a daily habit keeps the day picked', () => {
    expect(snapEndDay(daily, '2026-10-01')).toBe('2026-10-01');
  });

  test('a weekly habit moves to the nearest end of one of its weeks', () => {
    expect(snapEndDay(weekly, '2026-10-01')).toBe('2026-10-04');
    expect(snapEndDay(weekly, '2026-10-04')).toBe('2026-10-04');
    expect(snapEndDay(weekly, '2026-10-07')).toBe('2026-10-04');
    expect(snapEndDay(weekly, '2026-10-08')).toBe('2026-10-11');
  });
});

describe('validEndDay', () => {
  test('at least a week out', () => {
    expect(validEndDay(daily, '2026-09-27')).toBeNull();
    expect(validEndDay(daily, '2026-09-28')).toBe('2026-09-28');
    expect(validEndDay(weekly, '2026-09-25')).toBe('2026-09-27');
  });

  test('at most a year out', () => {
    expect(validEndDay(daily, endDayAfterWeeks(daily, 52))).not.toBeNull();
    expect(validEndDay(daily, '2027-12-01')).toBeNull();
  });

  test('anything that isn’t a day key is refused', () => {
    expect(validEndDay(daily, 'soon')).toBeNull();
  });
});

describe('restartableBefore', () => {
  test('one with no end date can always restart', () => {
    expect(restartableBefore({ timesPerWeek: 7 }, '2026-12-01')).toBe(true);
  });

  test('one with an end date needs a week left from today', () => {
    const dated = { timesPerWeek: 7, endsOn: '2026-10-05' };
    expect(restartableBefore(dated, '2026-09-28')).toBe(true);
    expect(restartableBefore(dated, '2026-09-29')).toBe(false);
  });
});

test('endDayLabel', () => {
  expect(endDayLabel('2026-10-30')).toBe('Fri, Oct 30');
});
