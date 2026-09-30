import { describe, expect, test } from 'vitest';

import { endingStatus, noticeKeeps, noticeMissCost } from './ending';

import type { StakeView } from '@/convex/lib/stakeRules';

// 2026-09-21 is a Monday.
const daily = { timesPerWeek: 7, completedToday: false, weekCount: 0 };
const weekly = { timesPerWeek: 3, completedToday: false, weekCount: 0 };

describe('endingStatus', () => {
  test('a habit that is not ending has none', () => {
    expect(endingStatus(daily, '2026-09-22')).toBeNull();
  });

  test('counts the days that still count, today included', () => {
    expect(endingStatus({ ...daily, endsAfter: '2026-09-28' }, '2026-09-22')).toMatchObject({
      daysLeft: 7,
      finished: false,
      label: 'Ending · 7 days left',
    });
    expect(endingStatus({ ...daily, endsAfter: '2026-09-28' }, '2026-09-28')).toMatchObject({
      daysLeft: 1,
      label: 'Ending · last day',
    });
  });

  test('a daily habit is finished once its last day is logged', () => {
    expect(
      endingStatus({ ...daily, endsAfter: '2026-09-28', completedToday: true }, '2026-09-28'),
    ).toMatchObject({ finished: true, label: 'Wraps up tonight' });
  });

  test('a weekly habit is finished once its final week hits the target', () => {
    const lastWeek = { ...weekly, endsAfter: '2026-09-27', weekCount: 3 };
    expect(endingStatus(lastWeek, '2026-09-24')).toMatchObject({ finished: true });
    // Hitting this week's target doesn't finish it when another week still counts.
    expect(endingStatus({ ...lastWeek, endsAfter: '2026-10-04' }, '2026-09-24')).toMatchObject({
      finished: false,
    });
  });

  test('past the last day, it is only waiting on the nightly check', () => {
    expect(endingStatus({ ...daily, endsAfter: '2026-09-28' }, '2026-09-29')).toMatchObject({
      daysLeft: 0,
      finished: true,
      label: 'Wrapping up',
    });
  });
});

describe('notice copy', () => {
  const money = {
    kind: 'money',
    status: 'armed',
    amountCents: 2000,
  } as StakeView;

  test('names what a miss costs and what finishing keeps', () => {
    expect(noticeMissCost(money)).toBe('$20 is charged');
    expect(noticeKeeps(money)).toBe('your $20 is released');
  });

  test('says nothing about a miss when nothing is on the line', () => {
    expect(noticeMissCost(null)).toBeNull();
  });
});
