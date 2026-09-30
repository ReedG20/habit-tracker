import { describe, expect, test } from 'vitest';

import { raiseOptions, raiseProblem, stakeRung, type LadderStake } from './stakeLadder';

const money = (amountCents: number): LadderStake => ({
  kind: 'money',
  status: 'armed',
  amountCents,
});
const friend: LadderStake = { kind: 'friend', status: 'armed' };
const optedOut: LadderStake = { kind: 'friend', status: 'void' };
const lockout = (days: 1 | 3 | 7): LadderStake => ({ kind: 'lockout', status: 'armed', days });

describe('stakeRung', () => {
  test('climbs word, lockout, friend, money', () => {
    expect([null, lockout(3), friend, money(100)].map(stakeRung)).toEqual([0, 1, 2, 3]);
  });

  test('a friend who opted out holds nothing', () => {
    expect(stakeRung(optedOut)).toBe(0);
  });
});

describe('raiseOptions', () => {
  test('from nothing, a habit can go anywhere, and money starts at $1', () => {
    expect(raiseOptions(null, 'habit')).toEqual({
      kinds: ['lockout', 'friend', 'money'],
      currentKind: 'none',
      moneyMinCents: 100,
      lockoutMinDays: 1,
      canRaise: true,
    });
  });

  test('goals skip the lockout', () => {
    expect(raiseOptions(null, 'goal').kinds).toEqual(['friend', 'money']);
  });

  test('a lockout can only get longer', () => {
    expect(raiseOptions(lockout(3), 'habit')).toMatchObject({
      kinds: ['lockout', 'friend', 'money'],
      lockoutMinDays: 7,
    });
    expect(raiseOptions(lockout(7), 'habit')).toMatchObject({
      kinds: ['friend', 'money'],
      lockoutMinDays: null,
    });
  });

  test('replacing a friend takes at least $10', () => {
    expect(raiseOptions(friend, 'habit')).toMatchObject({
      kinds: ['money'],
      currentKind: 'friend',
      moneyMinCents: 1000,
    });
  });

  test('a friend who opted out can be replaced by another friend', () => {
    expect(raiseOptions(optedOut, 'goal')).toMatchObject({
      kinds: ['friend', 'money'],
      currentKind: 'none',
      moneyMinCents: 100,
    });
  });

  test('money only goes up, and $50 is the top', () => {
    expect(raiseOptions(money(1000), 'goal')).toMatchObject({
      kinds: ['money'],
      moneyMinCents: 1100,
    });
    expect(raiseOptions(money(5000), 'goal')).toMatchObject({ kinds: [], canRaise: false });
  });
});

describe('raiseProblem', () => {
  test('allows a raise', () => {
    expect(raiseProblem(null, { kind: 'lockout', days: 1 }, 'habit')).toBeNull();
    expect(raiseProblem(lockout(1), { kind: 'lockout', days: 7 }, 'habit')).toBeNull();
    expect(raiseProblem(lockout(7), { kind: 'friend' }, 'habit')).toBeNull();
    expect(raiseProblem(friend, { kind: 'money', amountCents: 1000 }, 'habit')).toBeNull();
    expect(raiseProblem(money(1000), { kind: 'money', amountCents: 2500 }, 'goal')).toBeNull();
  });

  test('refuses anything that isn’t higher', () => {
    expect(raiseProblem(friend, { kind: 'lockout', days: 7 }, 'habit')).toBe(
      'That wouldn’t raise the stakes',
    );
    expect(raiseProblem(friend, { kind: 'friend' }, 'habit')).toBe(
      'That wouldn’t raise the stakes',
    );
    expect(raiseProblem(lockout(3), { kind: 'lockout', days: 3 }, 'habit')).toBe(
      'Pick a longer lockout',
    );
    expect(raiseProblem(money(1000), { kind: 'money', amountCents: 1000 }, 'goal')).toBe(
      'Raise it to at least $11',
    );
    expect(raiseProblem(null, { kind: 'lockout', days: 3 }, 'goal')).toBe(
      'That wouldn’t raise the stakes',
    );
  });

  test('holds the friend floor and the per-stake max', () => {
    expect(raiseProblem(friend, { kind: 'money', amountCents: 500 }, 'habit')).toBe(
      'Replacing a friend takes at least $10',
    );
    expect(raiseProblem(money(1000), { kind: 'money', amountCents: 5100 }, 'goal')).toBe(
      'A stake can be at most $50',
    );
  });
});
