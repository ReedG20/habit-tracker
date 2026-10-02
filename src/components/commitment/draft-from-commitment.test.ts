import { describe, expect, test } from 'vitest';

import { draftFromKept, higherStakePatch } from './draft-from-commitment';

import type { GoAgain } from '@/convex/accomplishments';
import type { Id } from '@/convex/_generated/dataModel';

const STAKE_ID = 'stake1' as Id<'stakes'>;
const FRIEND_ID = 'friend1' as Id<'friends'>;
const NOW = new Date(2026, 9, 2, 15, 0).getTime();

const HABIT: GoAgain = {
  kind: 'habit',
  title: 'Run',
  description: 'Running shoes on, outside',
  timesPerWeek: 3,
  proofMethod: 'location',
  lengthDays: 30,
  stake: { kind: 'money', stakeId: STAKE_ID, amountCents: 2000, cardBrand: 'visa', cardLast4: '4242' },
  complete: true,
};

describe('going again after one that was kept', () => {
  test('a habit keeps its words, method, frequency and card, over the same length', () => {
    expect(draftFromKept(HABIT, NOW, '2026-10-02')).toMatchObject({
      kind: 'habit',
      title: 'Run',
      proof: 'Running shoes on, outside',
      proofMethod: 'location',
      timesPerWeek: 3,
      endsOn: '2026-10-31',
      stakeKind: 'money',
      amountCents: 2000,
      reuse: { fromStakeId: STAKE_ID, label: 'Visa ••4242', on: true },
      checkedWording: expect.any(String),
    });
  });

  test('a goal gets a fresh deadline as far out as the last one was', () => {
    const draft = draftFromKept(
      {
        kind: 'goal',
        title: 'Ship the app',
        description: 'Live in the App Store',
        lengthMs: 10 * 24 * 60 * 60 * 1000,
        stake: { kind: 'friend', friendId: FRIEND_ID, name: 'Sam', email: 'sam@example.com' },
        complete: true,
      },
      NOW,
    );
    expect(draft).toMatchObject({
      kind: 'goal',
      stakeKind: 'friend',
      friend: { friendId: FRIEND_ID, name: 'Sam', email: 'sam@example.com' },
    });
    expect(new Date(draft.dueAt ?? 0)).toEqual(new Date(2026, 9, 12, 21, 0));
  });

  test('an old one with only its name still asks for the rest', () => {
    const draft = draftFromKept({ kind: 'habit', title: 'Run', stake: null, complete: false }, NOW);
    expect(draft).toMatchObject({ title: 'Run', proof: '', stakeKind: 'none' });
    expect(draft.checkedWording).toBeUndefined();
  });
});

describe('going again, higher', () => {
  test('climbs a rung', () => {
    expect(higherStakePatch(null, 'habit')).toEqual({ stakeKind: 'lockout', lockoutDays: 1 });
    expect(
      higherStakePatch({ kind: 'lockout', days: 3 }, 'habit'),
    ).toEqual({ stakeKind: 'friend' });
    expect(
      higherStakePatch(
        { kind: 'friend', friendId: FRIEND_ID, name: 'Sam', email: 'sam@example.com' },
        'goal',
      ),
    ).toEqual({ stakeKind: 'money', amountCents: 1000 });
  });

  test('money goes up by about half, in $5s, and stops at the most a stake can be', () => {
    expect(higherStakePatch(HABIT.stake, 'habit')).toEqual({
      stakeKind: 'money',
      amountCents: 3000,
    });
    expect(
      higherStakePatch({ kind: 'money', stakeId: STAKE_ID, amountCents: 4000 }, 'habit'),
    ).toEqual({ stakeKind: 'money', amountCents: 5000 });
    expect(
      higherStakePatch({ kind: 'money', stakeId: STAKE_ID, amountCents: 5000 }, 'habit'),
    ).toBeNull();
  });
});
