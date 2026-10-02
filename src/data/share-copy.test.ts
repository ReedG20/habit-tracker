import { describe, expect, test } from 'vitest';

import type { ShareSubject } from '@/convex/share';
import { cardsFor, hasAmount, shareCopy, shareMessage } from '@/data/share-copy';

const DAY = 24 * 60 * 60 * 1000;

const habit: ShareSubject = {
  commitment: 'habit',
  title: 'Run',
  timesPerWeek: 7,
  stake: { kind: 'money', amountCents: 5000 },
  streak: { count: 21, unit: 'day' },
};

const everyField = (copy: ReturnType<typeof shareCopy>) => Object.values(copy).join(' ');

describe('cardsFor', () => {
  test('a habit with a run opens on its streak, and can share its stakes', () => {
    expect(cardsFor(habit)).toEqual(['streak', 'stake']);
  });

  test('a habit with no run yet, or a goal, only has its stakes', () => {
    expect(cardsFor({ ...habit, streak: undefined })).toEqual(['stake']);
    expect(cardsFor({ commitment: 'goal', title: 'Ship', stake: { kind: 'none' } })).toEqual([
      'stake',
    ]);
  });

  test('something kept only has the kept card', () => {
    expect(cardsFor({ ...habit, kept: { achievedAt: 0 } })).toEqual(['kept']);
  });
});

describe('shareCopy', () => {
  test('the stakes card leads with the amount', () => {
    const copy = shareCopy(habit, 'stake', true);
    expect(copy.hero).toBe('$50');
    expect(copy.cadence).toBe('Every day');
    expect(copy.caption).toBe('Just put $50 on “Run”. If I miss, it’s gone.');
  });

  test('with the amount hidden, no card says it', () => {
    for (const card of ['stake', 'streak'] as const) {
      expect(everyField(shareCopy(habit, card, false))).not.toContain('$');
    }
    const kept = { ...habit, kept: { achievedAt: 0, run: { count: 30, unit: 'day' as const } } };
    expect(everyField(shareCopy(kept, 'kept', false))).not.toContain('$');
    expect(hasAmount(habit)).toBe(true);
    expect(hasAmount({ ...habit, stake: { kind: 'friend' } })).toBe(false);
  });

  test('a streak counts in days or weeks', () => {
    const copy = shareCopy(habit, 'streak', true);
    expect(copy.hero).toBe('21');
    expect(copy.heroUnit).toBe('days in a row');
    expect(copy.caption).toBe(
      '21 days in a row of “Run”, and counting. $50 on the line the whole way.',
    );

    const weekly = shareCopy(
      { ...habit, timesPerWeek: 3, streak: { count: 1, unit: 'week' } },
      'streak',
      true,
    );
    expect(weekly.heroUnit).toBe('week in a row');
    expect(weekly.cadence).toBe('3 times a week');
  });

  test('on the day it reaches a milestone, the streak card names it', () => {
    const copy = shareCopy({ ...habit, streak: { count: 30, unit: 'day' } }, 'streak', true);
    expect(copy.kicker).toBe('30 days straight');
    expect(copy.caption).toBe(
      '30 days straight of “Run”. Not stopping now. $50 on the line the whole way.',
    );

    const weekly = shareCopy(
      { ...habit, timesPerWeek: 3, streak: { count: 12, unit: 'week' } },
      'streak',
      true,
    );
    expect(weekly.kicker).toBe('12 weeks straight');
    expect(shareCopy(habit, 'streak', true).kicker).toBe('Still going');
  });

  test('a kept goal says how early it landed', () => {
    const achievedAt = Date.UTC(2026, 9, 1, 12);
    const goal: ShareSubject = {
      commitment: 'goal',
      title: 'Ship the app',
      dueAt: achievedAt + 3 * DAY,
      stake: { kind: 'friend' },
      kept: { achievedAt },
    };
    const copy = shareCopy(goal, 'kept', true);
    expect(copy.hero).toBe('Done.');
    expect(copy.line).toBe('Proved it, 3 days early.');
    expect(copy.caption).toBe('Done: “Ship the app”, 3 days early. My friend never heard a thing.');
  });

  test('a kept habit counts its run', () => {
    const copy = shareCopy(
      { ...habit, kept: { achievedAt: 0, run: { count: 34, unit: 'day' } } },
      'kept',
      true,
    );
    expect(copy.hero).toBe('34');
    expect(copy.heroUnit).toBe('days.');
    expect(copy.stakeLine).toBe('$50 stayed mine.');
  });

  test('each stake kind has its own stakes card', () => {
    expect(shareCopy({ ...habit, stake: { kind: 'lockout', days: 3 } }, 'stake', true).hero).toBe(
      '3 days locked',
    );
    expect(shareCopy({ ...habit, stake: { kind: 'none' } }, 'stake', true).hero).toBe('My word');
    expect(shareCopy({ ...habit, stake: { kind: 'friend' } }, 'stake', true).hero).toBe('A friend');
  });
});

test('the message ends with the link on its own line', () => {
  const copy = shareCopy(habit, 'stake', true);
  expect(shareMessage(copy, 'https://useanteapp.com/get?from=stake')).toBe(
    'Just put $50 on “Run”. If I miss, it’s gone.\n\nhttps://useanteapp.com/get?from=stake',
  );
});
