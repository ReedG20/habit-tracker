import { describe, expect, test } from 'vitest';

import { friendTextBody, friendTextCadence } from './invite-copy';

describe('the text to a friend on the hook', () => {
  test('names the friend and the commitment, says what they get, and ends on the link', () => {
    const body = friendTextBody({
      friendName: 'Sam',
      title: ' Work out for 20 minutes ',
      cadence: friendTextCadence({ kind: 'habit', timesPerWeek: 7 }),
      kind: 'habit',
      url: 'https://useanteapp.com/get?from=friend_text&ref=abc123defg',
    });
    expect(body).toBe(
      'Hey Sam, I just put you on the hook: “Work out for 20 minutes”, every day. If I skip it, Ante emails you so you can call me out. Nothing for you to do. Just don’t let me off easy. https://useanteapp.com/get?from=friend_text&ref=abc123defg',
    );
  });

  test('a weekly habit says how often, and a goal says by when', () => {
    expect(friendTextCadence({ kind: 'habit', timesPerWeek: 3 })).toBe('3 times a week');
    expect(friendTextCadence({ kind: 'goal', dueAt: Date.UTC(2026, 9, 24, 21) })).toMatch(/^by /);
    expect(
      friendTextBody({
        friendName: 'Sam',
        title: 'Ship the deck',
        cadence: 'by Fri',
        kind: 'goal',
        url: 'u',
      }),
    ).toContain('If I miss it, Ante emails you');
  });
});
