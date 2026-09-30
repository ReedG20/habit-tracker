import { describe, expect, test } from 'vitest';

import {
  bestStreak,
  dayHistory,
  HISTORY_DAYS,
  HISTORY_WEEKS,
  weekHistory,
  type HistoryInput,
} from './habitHistory';

// 2026-09-30 is a Wednesday.
const TODAY = '2026-09-30';

function input(fields: Partial<HistoryInput> = {}): HistoryInput {
  return {
    today: TODAY,
    firstDay: '2026-09-01',
    done: new Set(),
    excused: new Set(),
    pending: new Set(),
    frozen: new Set(),
    ...fields,
  };
}

function stateOf(days: { day: string; state: string }[], day: string) {
  return days.find((entry) => entry.day === day)?.state;
}

describe('dayHistory', () => {
  test('covers the last two weeks, oldest first, ending today', () => {
    const days = dayHistory(input());
    expect(days).toHaveLength(HISTORY_DAYS);
    expect(days[0].day).toBe('2026-09-17');
    expect(days.at(-1)?.day).toBe(TODAY);
  });

  test('tells done, missed, excused, frozen, pending and today apart', () => {
    const days = dayHistory(
      input({
        done: new Set(['2026-09-29', TODAY]),
        excused: new Set(['2026-09-28']),
        frozen: new Set(['2026-09-27']),
        pending: new Set(['2026-09-26']),
      }),
    );
    expect(stateOf(days, TODAY)).toBe('done');
    expect(stateOf(days, '2026-09-29')).toBe('done');
    expect(stateOf(days, '2026-09-28')).toBe('excused');
    expect(stateOf(days, '2026-09-27')).toBe('frozen');
    expect(stateOf(days, '2026-09-26')).toBe('pending');
    expect(stateOf(days, '2026-09-25')).toBe('missed');
  });

  test('today is open until it is logged', () => {
    expect(stateOf(dayHistory(input()), TODAY)).toBe('open');
  });

  test('days outside the habit’s run are off, but a log there still shows', () => {
    const days = dayHistory(
      input({ firstDay: '2026-09-25', lastDay: '2026-09-28', done: new Set(['2026-09-24']) }),
    );
    expect(stateOf(days, '2026-09-23')).toBe('off');
    expect(stateOf(days, '2026-09-24')).toBe('done');
    expect(stateOf(days, '2026-09-25')).toBe('missed');
    expect(stateOf(days, '2026-09-29')).toBe('off');
  });
});

describe('weekHistory', () => {
  test('covers the last eight weeks, ending with this one', () => {
    const weeks = weekHistory({ ...input({ firstDay: '2026-07-01' }), target: 3 });
    expect(weeks).toHaveLength(HISTORY_WEEKS);
    expect(weeks.at(-1)?.weekStart).toBe('2026-09-28');
    expect(weeks[0].weekStart).toBe('2026-08-10');
  });

  test('judges each week against the target', () => {
    const weeks = weekHistory({
      ...input({
        firstDay: '2026-07-01',
        done: new Set(['2026-09-21', '2026-09-22', '2026-09-24', '2026-09-15', TODAY]),
        excused: new Set(['2026-09-16']),
        frozen: new Set(['2026-09-09']),
      }),
      target: 3,
    });
    const byWeek = new Map(weeks.map((week) => [week.weekStart, week]));
    expect(byWeek.get('2026-09-28')).toMatchObject({ count: 1, state: 'open' });
    expect(byWeek.get('2026-09-21')).toMatchObject({ count: 3, state: 'met' });
    expect(byWeek.get('2026-09-14')).toMatchObject({ count: 1, state: 'short' });
    expect(byWeek.get('2026-09-07')).toMatchObject({ count: 0, state: 'frozen' });
    expect(byWeek.get('2026-08-31')).toMatchObject({ count: 0, state: 'short' });
  });

  test('only whole weeks after the start count', () => {
    // Started on a Wednesday: that week is free, the next Monday is the first judged.
    const weeks = weekHistory({ ...input({ firstDay: '2026-09-16' }), target: 2 });
    const byWeek = new Map(weeks.map((week) => [week.weekStart, week.state]));
    expect(byWeek.get('2026-09-14')).toBe('off');
    expect(byWeek.get('2026-09-21')).toBe('short');
  });
});

describe('bestStreak', () => {
  test('finds the longest run of days, not the latest', () => {
    const done = new Set(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10', '2026-09-11']);
    expect(bestStreak(done, 7, new Set())).toBe(3);
  });

  test('frozen days bridge a daily run without adding to it', () => {
    const done = new Set(['2026-09-01', '2026-09-02', '2026-09-05']);
    expect(bestStreak(done, 7, new Set(['2026-09-03', '2026-09-04']))).toBe(3);
    expect(bestStreak(done, 7, new Set(['2026-09-03']))).toBe(2);
  });

  test('counts weeks that hit the target for a weekly habit', () => {
    const done = new Set([
      // Week of Sep 7: 2 logs. Week of Sep 14: 2. Week of Sep 21: 1. Week of Sep 28: 2.
      '2026-09-07',
      '2026-09-09',
      '2026-09-14',
      '2026-09-16',
      '2026-09-22',
      '2026-09-28',
      '2026-09-29',
    ]);
    expect(bestStreak(done, 2, new Set())).toBe(2);
    expect(bestStreak(done, 1, new Set())).toBe(4);
  });

  test('is zero with nothing logged', () => {
    expect(bestStreak(new Set(), 7, new Set())).toBe(0);
  });
});
