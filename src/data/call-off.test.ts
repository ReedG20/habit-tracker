import { describe, expect, test } from 'vitest';

import type { Id } from '@/convex/_generated/dataModel';
import type { StakeView } from '@/convex/lib/stakeRules';
import { formatClock } from '@/lib/dates';

import { callOffBody, callOffConfirm, headsUpWhen, openCallOff } from './call-off';

const NOW = new Date(2026, 9, 1, 12).getTime();
const HOUR = 60 * 60 * 1000;
const stakeId = 'stake' as Id<'stakes'>;

const money: StakeView = { kind: 'money', _id: stakeId, status: 'armed', amountCents: 1000 };
const friend: StakeView = {
  kind: 'friend',
  _id: stakeId,
  status: 'armed',
  friendId: 'friend' as Id<'friends'>,
  friendName: 'Sam',
};
const lockout: StakeView = { kind: 'lockout', _id: stakeId, status: 'armed', days: 3 };

describe('openCallOff', () => {
  test('open while something live is on it and the window runs', () => {
    expect(openCallOff({ callOffUntil: NOW + HOUR }, money, NOW)).toBe(NOW + HOUR);
  });

  test('closed once the time passes, for their word, or once it is done', () => {
    expect(openCallOff({ callOffUntil: NOW }, money, NOW)).toBeNull();
    expect(openCallOff({}, money, NOW)).toBeNull();
    expect(openCallOff({ callOffUntil: NOW + HOUR }, null, NOW)).toBeNull();
    expect(openCallOff({ callOffUntil: NOW + HOUR, completedAt: NOW }, money, NOW)).toBeNull();
    expect(
      openCallOff({ callOffUntil: NOW + HOUR }, { ...money, status: 'released' }, NOW),
    ).toBeNull();
  });
});

describe('callOffBody', () => {
  const until = NOW + 2 * HOUR;
  const at = formatClock(until);

  test('a goal runs to its deadline after', () => {
    expect(callOffBody('goal', until, NOW, money)).toBe(
      `You can call it off or change the terms until ${at}. After that it runs to its deadline.`,
    );
  });

  test('a habit takes notice after, and a friend hears then', () => {
    expect(callOffBody('habit', until, NOW, friend)).toBe(
      `You can call it off or change the terms until ${at}. After that, ending it takes a week’s notice. Sam hears about it then, not before.`,
    );
  });
});

describe('callOffConfirm', () => {
  test('says what won’t happen, for each kind of stake', () => {
    expect(callOffConfirm(money).message).toBe('Nothing is charged, and it’s gone for good.');
    expect(callOffConfirm(friend).message).toBe(
      'Sam never hears about it, and it’s gone for good.',
    );
    expect(callOffConfirm(lockout).message).toBe('No lockout, and it’s gone for good.');
    expect(callOffConfirm(null).message).toBe('It’s gone for good.');
  });
});

describe('headsUpWhen', () => {
  test('reads mid-sentence: today, tomorrow, or further out', () => {
    const soon = NOW + 2 * HOUR;
    expect(headsUpWhen(soon, NOW)).toBe(`at ${formatClock(soon)}`);
    const tomorrow = new Date(2026, 9, 2, 8).getTime();
    expect(headsUpWhen(tomorrow, NOW)).toBe(`tomorrow at ${formatClock(tomorrow)}`);
    expect(headsUpWhen(new Date(2026, 9, 3, 8).getTime(), NOW)).toMatch(/^on \S+ /);
  });
});
