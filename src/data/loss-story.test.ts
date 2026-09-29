import { describe, expect, test } from 'vitest';

import type { Loss } from '@/convex/stakes';
import type { Id } from '@/convex/_generated/dataModel';
import { lossStory } from './loss-story';

const stakeId = 'stake1' as Id<'stakes'>;

function habitLoss(streak: number, stake: Partial<Loss['stake']> = {}): Loss {
  return {
    stake: {
      kind: 'money',
      _id: stakeId,
      status: 'charged',
      amountCents: 2500,
      cardBrand: 'visa',
      cardLast4: '4242',
      ...stake,
    } as Loss['stake'],
    title: 'Meditate',
    habitId: 'habit1' as Id<'habits'>,
    habitExists: true,
    run: {
      streak,
      unit: 'day',
      completions: streak,
      sinceDay: '2026-09-01',
      missedPeriod: '2026-09-22',
    },
    lostAt: 0,
    seen: false,
  };
}

describe('loss story', () => {
  test('a long run is credited to the money', () => {
    const story = lossStory(habitLoss(23));
    expect(story.line).toBe(
      'You missed Meditate on Tuesday, and your 23-day streak ended. $25 was charged to Visa ••4242.',
    );
    expect(story.bought).toMatchObject({
      title: '$25 bought you 23 days.',
      body: expect.stringContaining('About $1.09 a day'),
      short: false,
    });
  });

  test('a run that broke on day 2 says so honestly', () => {
    const story = lossStory(habitLoss(1));
    expect(story.line).toBe('You missed Meditate on Tuesday. $25 was charged to Visa ••4242.');
    expect(story.bought).toMatchObject({ title: 'It broke on day 2.', short: true });
  });

  test('a declined card says nothing moved, and that it is still owed', () => {
    const story = lossStory(habitLoss(10, { status: 'charge_failed', failureKind: 'declined' }));
    expect(story.gone).toBe(false);
    expect(story.line).toContain('Your card declined, so the $25 didn’t go through.');
  });

  test('a friend who was told, and a lockout, get their own words', () => {
    const friend = lossStory({
      ...habitLoss(12),
      stake: {
        kind: 'friend',
        _id: stakeId,
        status: 'told',
        friendId: 'f' as Id<'friends'>,
        friendName: 'Sam',
      },
    });
    expect(friend.headline).toEqual({ kind: 'words', text: 'Sam knows.' });
    expect(friend.line).toBe(
      'You missed Meditate on Tuesday, and your 12-day streak ended, so we emailed Sam.',
    );

    const lockout = lossStory({
      ...habitLoss(0),
      stake: { kind: 'lockout', _id: stakeId, status: 'triggered', days: 3 },
    });
    expect(lockout.headline).toEqual({ kind: 'words', text: 'Frozen.' });
    expect(lockout.line).toContain('every habit is frozen for a while. Goals still count.');
  });

  test('a goal has no run to credit', () => {
    const story = lossStory({
      ...habitLoss(0),
      habitId: undefined,
      goalId: 'goal1' as Id<'goals'>,
      run: undefined,
    });
    expect(story.kicker).toBe('Deadline missed');
    expect(story.bought).toBeNull();
    expect(story.line).toMatch(/^No proof for Meditate\. \$25 was charged/);
  });
});
