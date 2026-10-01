import { describe, expect, test } from 'vitest';

import type { Id } from '../_generated/dataModel';
import {
  findMisses,
  firstCountedDay,
  isOwed,
  isValidTimeZone,
  localDay,
  type CheckedHabit,
} from './lockout';

// 2026-09-21 is a Monday.
const HABIT = 'habit1' as Id<'habits'>;

function habit(fields: Partial<CheckedHabit> = {}): CheckedHabit {
  return { _id: HABIT, title: 'Run', timesPerWeek: 7, ...fields };
}

function check({
  habits = [habit()],
  done = [] as string[],
  excused = [] as string[],
  accountableFrom = '2026-09-01',
  from,
  to,
}: {
  habits?: CheckedHabit[];
  done?: string[];
  excused?: string[];
  accountableFrom?: string;
  from: string;
  to: string;
}) {
  return findMisses({
    habits,
    completedDays: new Map([[HABIT, new Set(done)]]),
    excusedDays: new Map([[HABIT, new Set(excused)]]),
    accountableFrom,
    from,
    to,
  });
}

describe('localDay', () => {
  test('follows the zone, not UTC', () => {
    // 2026-09-22 03:00 UTC is still the 21st in Chicago and already the 22nd in Tokyo.
    const at = Date.UTC(2026, 8, 22, 3);
    expect(localDay(at, 'UTC')).toBe('2026-09-22');
    expect(localDay(at, 'America/Chicago')).toBe('2026-09-21');
    expect(localDay(at, 'Asia/Tokyo')).toBe('2026-09-22');
  });

  test('rejects zones the runtime does not know', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('findMisses: daily', () => {
  test('a day without a log is a miss', () => {
    expect(check({ done: ['2026-09-21'], from: '2026-09-21', to: '2026-09-22' })).toEqual([
      { habitId: HABIT, title: 'Run', kind: 'day', period: '2026-09-22' },
    ]);
  });

  test('every day logged is no miss', () => {
    expect(
      check({ done: ['2026-09-21', '2026-09-22'], from: '2026-09-21', to: '2026-09-22' }),
    ).toEqual([]);
  });

  test('only the earliest miss per habit is reported', () => {
    expect(check({ from: '2026-09-21', to: '2026-09-24' })).toMatchObject([
      { period: '2026-09-21' },
    ]);
  });

  test('the day it was made is free', () => {
    const made = habit({ startDay: '2026-09-21' });
    expect(check({ habits: [made], from: '2026-09-21', to: '2026-09-21' })).toEqual([]);
    expect(check({ habits: [made], from: '2026-09-21', to: '2026-09-22' })).toMatchObject([
      { period: '2026-09-22' },
    ]);
  });

  test('nothing before accountableFrom counts', () => {
    expect(check({ accountableFrom: '2026-09-23', from: '2026-09-21', to: '2026-09-22' })).toEqual(
      [],
    );
  });

  test('a failed photo check excuses the day', () => {
    expect(check({ excused: ['2026-09-22'], from: '2026-09-22', to: '2026-09-22' })).toEqual([]);
  });

  test('a habit being deleted still counts through endsAfter, then stops', () => {
    const ending = habit({ endsAfter: '2026-09-22' });
    expect(check({ habits: [ending], from: '2026-09-22', to: '2026-09-22' })).toHaveLength(1);
    expect(check({ habits: [ending], from: '2026-09-23', to: '2026-09-25' })).toEqual([]);
  });
});

describe('findMisses: weekly', () => {
  const thrice = (fields: Partial<CheckedHabit> = {}) => habit({ timesPerWeek: 3, ...fields });

  test('a week that ends short is a miss, judged on its Sunday', () => {
    const done = ['2026-09-21', '2026-09-23'];
    // Mid-week there is nothing to judge yet.
    expect(check({ habits: [thrice()], done, from: '2026-09-21', to: '2026-09-26' })).toEqual([]);
    expect(check({ habits: [thrice()], done, from: '2026-09-27', to: '2026-09-27' })).toEqual([
      { habitId: HABIT, title: 'Run', kind: 'week', period: '2026-09-21' },
    ]);
  });

  test('a week that hits the target is no miss', () => {
    const done = ['2026-09-21', '2026-09-23', '2026-09-27'];
    expect(check({ habits: [thrice()], done, from: '2026-09-27', to: '2026-09-27' })).toEqual([]);
  });

  test('weeks start on the weekday it was made, and the first one counts', () => {
    // Made on Wednesday 2026-09-23: weeks run Wednesday to Tuesday.
    const made = thrice({ startDay: '2026-09-23' });
    expect(check({ habits: [made], from: '2026-09-27', to: '2026-09-28' })).toEqual([]);
    expect(check({ habits: [made], from: '2026-09-29', to: '2026-09-29' })).toMatchObject([
      { kind: 'week', period: '2026-09-23' },
    ]);
  });

  test('the day it is made counts toward week one', () => {
    const made = thrice({ startDay: '2026-09-23' });
    const done = ['2026-09-23', '2026-09-25', '2026-09-29'];
    expect(check({ habits: [made], done, from: '2026-09-29', to: '2026-09-29' })).toEqual([]);
  });

  test('a day made free by signing up does not cost week one', () => {
    // Signed up and made it the same day: accountableFrom is the day after.
    const made = thrice({ startDay: '2026-09-23' });
    expect(
      check({
        habits: [made],
        accountableFrom: '2026-09-24',
        from: '2026-09-29',
        to: '2026-09-29',
      }),
    ).toMatchObject([{ period: '2026-09-23' }]);
  });

  test('a week already under way when the user was let back in is free', () => {
    const made = thrice({ startDay: '2026-09-23' });
    // Back in on Friday the 25th: that week is free, the next one counts.
    expect(
      check({
        habits: [made],
        accountableFrom: '2026-09-26',
        from: '2026-09-29',
        to: '2026-10-06',
      }),
    ).toMatchObject([{ period: '2026-09-30' }]);
  });

  test('restarting re-anchors the weeks', () => {
    // Restarted on Sunday 2026-09-27: weeks now run Sunday to Saturday.
    const made = thrice({ startDay: '2026-09-27' });
    expect(check({ habits: [made], from: '2026-09-29', to: '2026-10-02' })).toEqual([]);
    expect(check({ habits: [made], from: '2026-10-03', to: '2026-10-03' })).toMatchObject([
      { period: '2026-09-27' },
    ]);
  });

  test('excused days count toward the target', () => {
    const done = ['2026-09-21', '2026-09-23'];
    expect(
      check({
        habits: [thrice()],
        done,
        excused: ['2026-09-25'],
        from: '2026-09-27',
        to: '2026-09-27',
      }),
    ).toEqual([]);
  });
});

describe('isOwed', () => {
  test('a daily habit is owed until today is logged', () => {
    expect(isOwed(habit(), new Set(), '2026-09-22', '2026-09-01')).toBe(true);
    expect(isOwed(habit(), new Set(['2026-09-22']), '2026-09-22', '2026-09-01')).toBe(false);
  });

  test('a weekly habit made today is owed from today', () => {
    const weekly = habit({ timesPerWeek: 2, startDay: '2026-09-23' });
    expect(isOwed(weekly, new Set(), '2026-09-23', '2026-09-24')).toBe(true);
  });

  test('a habit made today owes nothing yet', () => {
    expect(isOwed(habit({ startDay: '2026-09-22' }), new Set(), '2026-09-22', '2026-09-01')).toBe(
      false,
    );
  });

  test('a weekly habit is owed until the week hits its target', () => {
    const weekly = habit({ timesPerWeek: 2 });
    expect(isOwed(weekly, new Set(['2026-09-21']), '2026-09-23', '2026-09-01')).toBe(true);
    expect(isOwed(weekly, new Set(['2026-09-21', '2026-09-22']), '2026-09-23', '2026-09-01')).toBe(
      false,
    );
  });

  test('firstCountedDay is the later of the day after the start and accountableFrom', () => {
    expect(firstCountedDay(habit({ startDay: '2026-09-21' }), '2026-09-01')).toBe('2026-09-22');
    expect(firstCountedDay(habit({ startDay: '2026-09-21' }), '2026-09-30')).toBe('2026-09-30');
    expect(firstCountedDay(habit(), '2026-09-30')).toBe('2026-09-30');
  });
});
