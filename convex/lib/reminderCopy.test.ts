import { describe, expect, test } from 'vitest';

import {
  eventCopy,
  formatDayLabel,
  formatDueLabel,
  formatMoney,
  formatTimeLeft,
  reminderCopy,
} from './reminderCopy';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('formatting', () => {
  test('time left reads the way a person says it', () => {
    expect(formatTimeLeft(3 * MINUTE)).toBe('3 min');
    expect(formatTimeLeft(44 * MINUTE)).toBe('45 min');
    expect(formatTimeLeft(90 * MINUTE)).toBe('90 min');
    expect(formatTimeLeft(5 * HOUR)).toBe('5h');
    expect(formatTimeLeft(24 * HOUR)).toBe('24h');
    expect(formatTimeLeft(72 * HOUR)).toBe('3 days');
  });

  test('money drops cents when there are none', () => {
    expect(formatMoney(2500)).toBe('$25');
    expect(formatMoney(1250)).toBe('$12.50');
  });

  test('due labels get vaguer the further out they are', () => {
    const now = Date.parse('2026-09-21T15:00:00Z'); // Monday, 10 AM in Chicago
    const zone = 'America/Chicago';
    expect(formatDueLabel(Date.parse('2026-09-21T22:00:00Z'), now, zone)).toBe('5pm');
    expect(formatDueLabel(Date.parse('2026-09-22T22:30:00Z'), now, zone)).toBe('tomorrow 5:30pm');
    expect(formatDueLabel(Date.parse('2026-09-25T22:00:00Z'), now, zone)).toBe('Fri 5pm');
    expect(formatDueLabel(Date.parse('2026-10-03T05:00:00Z'), now, zone)).toBe('Oct 3, 12am');
  });

  test('day labels name the day, not the time', () => {
    const now = Date.parse('2026-09-21T15:00:00Z'); // Monday, 10 AM in Chicago
    const zone = 'America/Chicago';
    expect(formatDayLabel(Date.parse('2026-09-22T15:00:00Z'), now, zone)).toBe('tomorrow');
    expect(formatDayLabel(Date.parse('2026-09-24T15:00:00Z'), now, zone)).toBe('Thursday');
    expect(formatDayLabel(Date.parse('2026-10-12T15:00:00Z'), now, zone)).toBe('Oct 12');
  });
});

describe('reminders', () => {
  test('habits: one, several, and the last call', () => {
    const one = reminderCopy({
      kind: 'habits',
      habits: [{ title: 'Run' }],
      msLeft: 5 * HOUR,
      final: false,
      seed: 'a',
    });
    expect(one.title).toBe('Run');
    expect(one.body).toContain('5h');

    const several = reminderCopy({
      kind: 'habits',
      habits: [{ title: 'Run' }, { title: 'Read' }, { title: 'Stretch' }, { title: 'Floss' }],
      msLeft: 5 * HOUR,
      final: false,
      seed: 'a',
    });
    expect(several.title).toBe('4 still open');
    expect(several.body).toMatch(/^Run, Read, Stretch \+1\./);

    const last = reminderCopy({
      kind: 'habits',
      habits: [{ title: 'Run' }],
      msLeft: 90 * MINUTE,
      final: true,
      seed: 'a',
    });
    expect(last.title).toBe('Last call: Run');
    expect(last.body).toContain('90 min');
  });

  test('a weekly habit with no slack', () => {
    const copy = reminderCopy({
      kind: 'habits',
      habits: [{ title: 'Gym', weeklyNeeded: 2 }],
      msLeft: 5 * HOUR,
      final: false,
      seed: 'a',
    });
    expect(copy.title).toBe('Gym, today');
    expect(copy.body).toMatch(/2/);
  });

  test('goals mention the money, or the word, never both', () => {
    const staked = reminderCopy({
      kind: 'goals',
      goals: [{ title: 'Essay', stakeCents: 2500 }],
      dueLabel: '5pm',
      msLeft: 45 * MINUTE,
      final: true,
      seed: 'a',
    });
    expect(staked.title).toBe('Last call: Essay');
    expect(staked.body).toContain('$25');

    const unstaked = reminderCopy({
      kind: 'goals',
      goals: [{ title: 'Essay', stakeCents: null }],
      dueLabel: 'Fri 5pm',
      msLeft: 72 * HOUR,
      final: false,
      seed: 'a',
    });
    expect(unstaked.title).toBe('Essay · due Fri 5pm');
    expect(unstaked.body).not.toContain('$');
  });

  test('the same seed always picks the same words', () => {
    const message = {
      kind: 'habits' as const,
      habits: [{ title: 'Run' }],
      msLeft: 5 * HOUR,
      final: false,
      seed: 'habits:2026-09-22:123',
    };
    expect(reminderCopy(message)).toEqual(reminderCopy(message));
  });

  test('back-to-back nudges for one deadline never read the same', () => {
    const nudge = (step: number) =>
      reminderCopy({
        kind: 'habits',
        habits: [{ title: 'Run' }],
        msLeft: 5 * HOUR,
        final: false,
        seed: 'habits:2026-09-22',
        step,
      }).body;
    expect(nudge(0)).not.toBe(nudge(1));
    expect(nudge(1)).not.toBe(nudge(2));
  });
});

describe('events', () => {
  test('a rejection says how long is left to retry', () => {
    const copy = eventCopy({
      kind: 'rejected',
      subject: 'habit',
      title: 'Run',
      reason: 'This looks like a screenshot.',
      msLeft: 2 * HOUR,
    });
    expect(copy.body).toBe('This looks like a screenshot. 2h left to retry.');
  });

  test('a lock that is still billing says so, then warns before the renewal', () => {
    expect(eventCopy({ kind: 'stillLocked', renewsLabel: 'Oct 12', renewal: false })).toEqual({
      title: 'Ante is still locked',
      body: 'Your Ante Pro subscription is still active and renews Oct 12. Pay the fee to get back in, or manage your subscription.',
    });
    expect(eventCopy({ kind: 'stillLocked', renewsLabel: 'Thursday', renewal: true }).title).toBe(
      'Ante Pro renews Thursday',
    );
  });

  test('a trial names the day it ends', () => {
    expect(eventCopy({ kind: 'trialEnding', endsLabel: 'Thursday' }).title).toBe(
      'Your free week ends Thursday',
    );
  });

  test('a charge is plain about it', () => {
    expect(eventCopy({ kind: 'charged', title: 'Essay', amountCents: 2500 })).toEqual({
      title: 'Essay: deadline passed',
      body: 'No proof came in, so $25 was charged.',
    });
  });
});
