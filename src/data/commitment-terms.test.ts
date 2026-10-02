import { describe, expect, test } from 'vitest';

import { goalTerms } from './commitment-terms';

import type { Doc, Id } from '@/convex/_generated/dataModel';
import type { StakeView } from '@/convex/lib/stakeRules';

const NOW = Date.UTC(2026, 9, 1, 12);

function friendGoal(status: 'armed' | 'told'): Doc<'goals'> & { stakeView: StakeView } {
  return {
    _id: 'goal' as Id<'goals'>,
    _creationTime: NOW,
    userId: 'user' as Id<'users'>,
    title: 'Run a half marathon',
    order: 0,
    dueAt: NOW + 10 * 24 * 60 * 60 * 1000,
    stakeView: {
      kind: 'friend',
      _id: 'stake' as Id<'stakes'>,
      status,
      friendId: 'friend' as Id<'friends'>,
      friendName: 'Sam',
    },
  };
}

function stakeOf(terms: ReturnType<typeof goalTerms>) {
  return terms.find((term) => term.key === 'stake');
}

describe('a friend stake’s term', () => {
  test('says where the email goes, when the address is known', () => {
    expect(stakeOf(goalTerms(friendGoal('armed'), NOW, 'sam@example.com'))).toMatchObject({
      value: 'Sam',
      note: 'Hears about it at sam@example.com if you miss the deadline.',
    });
    expect(stakeOf(goalTerms(friendGoal('told'), NOW, 'sam@example.com'))).toMatchObject({
      value: 'Sam was told',
      note: 'Emailed at sam@example.com.',
    });
  });

  test('reads as before without one', () => {
    expect(stakeOf(goalTerms(friendGoal('armed'), NOW))).toMatchObject({
      note: 'Hears about it if you miss the deadline.',
    });
    expect(stakeOf(goalTerms(friendGoal('told'), NOW))?.note).toBeUndefined();
  });
});
