import { describe, expect, test } from 'vitest';

import {
  missNow,
  raiseDraft,
  raiseHint,
  replacedLine,
  startingAmount,
  startingKind,
} from './raise';

import type { Id } from '@/convex/_generated/dataModel';
import { raiseOptions } from '@/convex/lib/stakeLadder';
import type { StakeView } from '@/convex/lib/stakeRules';

const stakeId = 'stake1' as Id<'stakes'>;
const money = (amountCents: number): StakeView => ({
  kind: 'money',
  _id: stakeId,
  status: 'armed',
  amountCents,
  cardBrand: 'visa',
  cardLast4: '4242',
});
const friend = (status: 'armed' | 'void' = 'armed'): StakeView => ({
  kind: 'friend',
  _id: stakeId,
  status,
  friendId: 'friend1' as Id<'friends'>,
  friendName: 'Sam',
});
const lockout = (days: 1 | 3 | 7): StakeView => ({
  kind: 'lockout',
  _id: stakeId,
  status: 'armed',
  days,
});

describe('startingAmount', () => {
  test('money already there starts at the next step up', () => {
    expect(startingAmount(raiseOptions(money(1000), 'goal'))).toBe(2500);
    expect(startingAmount(raiseOptions(money(500), 'goal'))).toBe(1000);
    expect(startingAmount(raiseOptions(money(3000), 'goal'))).toBe(5000);
  });

  test('otherwise the usual $10, which is also the floor off a friend', () => {
    expect(startingAmount(raiseOptions(null, 'habit'))).toBe(1000);
    expect(startingAmount(raiseOptions(friend(), 'habit'))).toBe(1000);
  });
});

describe('startingKind', () => {
  test('the highest rung on offer', () => {
    expect(startingKind(raiseOptions(null, 'habit'))).toBe('money');
    expect(startingKind(raiseOptions(money(5000), 'habit'))).toBe('money');
  });
});

describe('raiseDraft', () => {
  test('a longer lockout than the one there, never a shorter one', () => {
    const target = {
      commitment: 'habit' as const,
      title: 'Run',
      stake: lockout(3),
      blocked: null,
    };
    expect(raiseDraft(target, raiseOptions(target.stake, 'habit')).lockoutDays).toBe(7);
    expect(raiseDraft({ ...target, stake: null }, raiseOptions(null, 'habit')).lockoutDays).toBe(3);
  });
});

describe('missNow', () => {
  test('says what a miss does today', () => {
    expect(missNow(null)).toBe('costs you nothing');
    expect(missNow(friend('void'))).toBe('costs you nothing: Sam opted out');
    expect(missNow(lockout(1))).toBe('freezes your habits for 1 day');
    expect(missNow(friend())).toBe('means Sam hears about it');
    expect(missNow(money(1500))).toBe('costs you $15');
  });
});

describe('replacedLine', () => {
  test('names what the old stake becomes', () => {
    expect(replacedLine(friend(), 'money')).toBe(
      'Sam is off the hook: we won’t email them about this one.',
    );
    expect(replacedLine(lockout(7), 'friend')).toBe('The week-long lockout comes off.');
    expect(replacedLine(lockout(3), 'money')).toBe('The 3-day lockout comes off.');
  });

  test('nothing when there was nothing, or it stays the same kind', () => {
    expect(replacedLine(null, 'money')).toBeNull();
    expect(replacedLine(friend('void'), 'friend')).toBeNull();
    expect(replacedLine(money(1000), 'money')).toBeNull();
  });
});

describe('raiseHint', () => {
  const hint = (stake: StakeView | null, commitment: 'habit' | 'goal') =>
    raiseHint(stake, raiseOptions(stake, commitment));

  test('names what’s above the stake there now', () => {
    expect(hint(null, 'habit')).toBe('Back it with a lockout, a friend or money.');
    expect(hint(null, 'goal')).toBe('Back it with a friend or money.');
    expect(hint(lockout(3), 'habit')).toBe('Back it with a longer lockout, a friend or money.');
    expect(hint(lockout(7), 'habit')).toBe('Back it with a friend or money.');
    expect(hint(friend(), 'habit')).toBe('Swap Sam for money: $10 or more.');
    expect(hint(friend('void'), 'goal')).toBe('Sam opted out. Try a new friend or money.');
    expect(hint(money(1000), 'goal')).toBe('Put more than $10 on it.');
  });
});
