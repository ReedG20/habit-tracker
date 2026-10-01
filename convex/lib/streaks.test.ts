import { describe, expect, test } from 'vitest';

import type { Id } from '../_generated/dataModel';
import { daysBefore } from './days';
import { excusedDays, runOf } from './streaks';

const HABIT = 'habit1' as Id<'habits'>;
const OTHER = 'habit2' as Id<'habits'>;
// A Monday.
const TODAY = '2026-09-21';

/** `count` days in a row, ending with `last`. */
function daysEnding(last: string, count: number): Set<string> {
  return new Set(Array.from({ length: count }, (_, back) => daysBefore(last, back)));
}

const none = new Set<string>();

describe('runOf', () => {
  test('an excused day bridges a daily run without adding to it', () => {
    const done = new Set([...daysEnding('2026-09-19', 3), TODAY]);
    const excused = new Set(['2026-09-20']);
    expect(
      runOf({ target: 7, startsOn: 0, done, excused: none, frozen: none, through: TODAY }),
    ).toMatchObject({ streak: 1 });
    expect(
      runOf({ target: 7, startsOn: 0, done, excused, frozen: none, through: TODAY }),
    ).toMatchObject({ streak: 4 });
  });

  test('an excused day counts toward a weekly target', () => {
    // Weeks of Sep 7 and Sep 14: two logs each, one of them excused in the second.
    const done = new Set(['2026-09-08', '2026-09-09', '2026-09-15']);
    const excused = new Set(['2026-09-16']);
    const input = { target: 2, startsOn: 0, done, frozen: none, through: TODAY };
    expect(runOf({ ...input, excused: none }).streak).toBe(0);
    expect(runOf({ ...input, excused }).streak).toBe(2);
  });

  test('a daily run reaches its window only when it walks back to the first day read', () => {
    const from = daysBefore(TODAY, 10);
    const input = { target: 7, startsOn: 0, excused: none, frozen: none, through: TODAY, from };
    expect(runOf({ ...input, done: daysEnding(TODAY, 11) })).toEqual({
      streak: 11,
      reachesFrom: true,
    });
    expect(runOf({ ...input, done: daysEnding(TODAY, 10) })).toEqual({
      streak: 10,
      reachesFrom: false,
    });
    // A freeze at the edge could carry the run further back too.
    expect(
      runOf({ ...input, done: daysEnding(TODAY, 10), frozen: new Set([from]) }).reachesFrom,
    ).toBe(true);
    expect(runOf({ ...input, done: daysEnding(TODAY, 11), from: undefined }).reachesFrom).toBe(
      false,
    );
  });

  test('a weekly run reaches its window at the first full week read', () => {
    // Every day logged since Aug 24 (a Monday).
    const done = daysEnding(TODAY, 29);
    const input = { target: 3, startsOn: 0, done, excused: none, frozen: none, through: TODAY };
    // Read from a Monday: the first week is whole.
    expect(runOf({ ...input, from: '2026-08-24' }).reachesFrom).toBe(true);
    // Read from a Saturday: that week looks short (two logs) only because it was partly read,
    // so the run starting the week after still reaches the window.
    expect(runOf({ ...input, done: daysEnding(TODAY, 24), from: '2026-08-29' })).toEqual({
      streak: 3,
      reachesFrom: true,
    });
    // A run that ends well inside the window doesn't.
    expect(runOf({ ...input, done: daysEnding(TODAY, 14), from: '2026-08-24' }).reachesFrom).toBe(
      false,
    );
  });
});

describe('excusedDays', () => {
  test('a day is excused when its newest check failed', () => {
    const excused = excusedDays([
      { habitId: HABIT, day: '2026-09-19', status: 'failed', createdAt: 1 },
      // A retake that went through un-excuses the day.
      { habitId: HABIT, day: '2026-09-20', status: 'failed', createdAt: 1 },
      { habitId: HABIT, day: '2026-09-20', status: 'approved', createdAt: 2 },
      // A failed retake after a rejection excuses it.
      { habitId: OTHER, day: '2026-09-20', status: 'rejected', createdAt: 1 },
      { habitId: OTHER, day: '2026-09-20', status: 'failed', createdAt: 2 },
    ]);
    expect(excused.get(HABIT)).toEqual(new Set(['2026-09-19']));
    expect(excused.get(OTHER)).toEqual(new Set(['2026-09-20']));
  });
});
