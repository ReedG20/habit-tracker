import { describe, expect, test } from 'vitest';

import {
  RAISE_NUDGE_WINDOW_MS,
  raiseNudgeCopy,
  shouldShowRaiseNudge,
  type RaiseNudgeCandidate,
} from './raise-nudge';

import type { Id } from '@/convex/_generated/dataModel';

const now = Date.parse('2026-09-30T12:00:00Z');
const HOUR = 60 * 60 * 1000;

const friendStake = {
  kind: 'friend' as const,
  _id: 'stake1' as Id<'stakes'>,
  status: 'armed' as const,
  friendId: 'friend1' as Id<'friends'>,
  friendName: 'Sam',
};

const candidate: RaiseNudgeCandidate = {
  target: { habitId: 'habit1' as Id<'habits'> },
  title: 'Read 20 pages',
  stake: friendStake,
  onboardedAt: now - HOUR,
};

describe('shouldShowRaiseNudge', () => {
  const base = { candidate, isPro: true, dismissed: false, now };

  test('shows in the first week for a Pro user', () => {
    expect(shouldShowRaiseNudge(base)).toBe(true);
  });

  test('not while loading, without a candidate, or without Pro', () => {
    expect(shouldShowRaiseNudge({ ...base, candidate: undefined })).toBe(false);
    expect(shouldShowRaiseNudge({ ...base, candidate: null })).toBe(false);
    expect(shouldShowRaiseNudge({ ...base, isPro: false })).toBe(false);
  });

  test('a dismissal is for good', () => {
    expect(shouldShowRaiseNudge({ ...base, dismissed: true })).toBe(false);
  });

  test('goes away on its own after a week', () => {
    const onboardedAt = now - RAISE_NUDGE_WINDOW_MS;
    expect(shouldShowRaiseNudge({ ...base, candidate: { ...candidate, onboardedAt } })).toBe(false);
    expect(
      shouldShowRaiseNudge({ ...base, candidate: { ...candidate, onboardedAt: onboardedAt + 1 } }),
    ).toBe(true);
  });

  test('not for a goal about to come due', () => {
    const goal = { ...candidate, target: { goalId: 'goal1' as Id<'goals'> } };
    expect(shouldShowRaiseNudge({ ...base, candidate: { ...goal, dueAt: now + 30_000 } })).toBe(
      false,
    );
    expect(shouldShowRaiseNudge({ ...base, candidate: { ...goal, dueAt: now + HOUR } })).toBe(true);
  });
});

describe('raiseNudgeCopy', () => {
  test('says the friend is off the hook, since money replaces them', () => {
    expect(raiseNudgeCopy(candidate)).toEqual({
      title: 'Ready to put money on it?',
      body: 'Onboarding couldn’t take a card. Now it can: put money on “Read 20 pages” and a miss costs you. Sam’s off the hook if you do.',
      action: 'Up the ante',
    });
  });

  test('no friend to mention when it was their word, or the friend opted out', () => {
    expect(raiseNudgeCopy({ ...candidate, stake: null }).body).not.toContain('off the hook');
    expect(
      raiseNudgeCopy({ ...candidate, stake: { ...friendStake, status: 'void' } }).body,
    ).not.toContain('off the hook');
  });
});
