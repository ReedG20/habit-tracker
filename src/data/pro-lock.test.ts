import { describe, expect, test } from 'vitest';

import { paywallHeaderCopy, proLockHeroCopy, proLockLedger } from './pro-lock';
import type { SubscriptionSummary } from './subscription';

import { formatShortDate } from '@/lib/dates';

const endedAt = Date.parse('2026-09-12T12:00:00Z');
const ended: SubscriptionSummary = { status: 'expired', expiresAt: endedAt, willRenew: false };
const date = formatShortDate(endedAt);

describe('proLockLedger', () => {
  test('lapsed: what paused, what still runs, what’s locked', () => {
    const ledger = proLockLedger({ summary: ended, pausedHabits: 3, liveGoals: 2 });
    expect(ledger.title).toBe(`Ante Pro ended ${date}`);
    expect(ledger.rows).toEqual([
      { id: 'habits', label: '3 habits', status: 'Paused' },
      { id: 'goals', label: '2 goals', status: 'Still running' },
      { id: 'new', label: 'New habits and goals', status: 'Locked' },
    ]);
    expect(ledger.actionLabel).toBe('Resubscribe');
  });

  test('singular, and leaves out what the user has none of', () => {
    const ledger = proLockLedger({ summary: ended, pausedHabits: 1, liveGoals: 0 });
    expect(ledger.rows.map((row) => row.label)).toEqual(['1 habit', 'New habits and goals']);
    expect(proLockLedger({ summary: ended, pausedHabits: 0, liveGoals: 1 }).rows[0].label).toBe(
      '1 goal',
    );
  });

  test('never subscribed: only the lock, and the way in', () => {
    const ledger = proLockLedger({ summary: null, pausedHabits: 0, liveGoals: 0 });
    expect(ledger.title).toBe('No Ante Pro yet');
    expect(ledger.rows.map((row) => row.id)).toEqual(['new']);
    expect(ledger.actionLabel).toBe('Start Ante Pro');
  });

  test('an ended subscription with no date still reads', () => {
    const ledger = proLockLedger({
      summary: { status: 'expired', willRenew: false },
      pausedHabits: 1,
      liveGoals: 0,
    });
    expect(ledger.title).toBe('Ante Pro is off');
  });
});

describe('proLockHeroCopy', () => {
  test('never subscribed, with nothing made', () => {
    const copy = proLockHeroCopy({ summary: null, pausedHabits: 0, liveGoals: 0 });
    expect(copy.kicker).toBe('No Ante Pro yet');
    expect(copy.headline).toBe('Nothing’s on the line.');
    expect(copy.actionLabel).toBe('Start Ante Pro');
  });

  test('lapsed with habits: paused, and nothing new', () => {
    const copy = proLockHeroCopy({ summary: ended, pausedHabits: 2, liveGoals: 0 });
    expect(copy.kicker).toBe(`Ante Pro ended ${date}`);
    expect(copy.headline).toBe('Your habits are paused.');
    expect(copy.sentence).toContain('Nothing counts against them');
    expect(copy.sentence).toContain('until you resubscribe');
    for (const word of copy.emphasis) expect(copy.sentence).toContain(word);
    expect(copy.actionLabel).toBe('Resubscribe');
  });

  test('lapsed with nothing left', () => {
    const copy = proLockHeroCopy({ summary: ended, pausedHabits: 0, liveGoals: 0 });
    expect(copy.headline).toBe('Nothing’s on the line.');
    expect(copy.sentence).toBe('You can’t start a new habit or goal until you resubscribe.');
  });
});

describe('paywallHeaderCopy', () => {
  test('from New, it names the commitment', () => {
    expect(paywallHeaderCopy({ summary: null, pausedHabits: 0, source: 'new' }).title).toBe(
      'Start Ante Pro to make a commitment.',
    );
    expect(paywallHeaderCopy({ summary: ended, pausedHabits: 0, source: 'new' }).title).toBe(
      'Resubscribe to make a commitment.',
    );
  });

  test('lapsed with habits: bring them back, nothing owed', () => {
    const copy = paywallHeaderCopy({ summary: ended, pausedHabits: 2, source: 'daily' });
    expect(copy.title).toBe('Bring your habits back.');
    expect(copy.subtitle).toContain(`Ante Pro ended ${date}`);
    expect(copy.subtitle).toContain('nothing owed');
  });

  test('lapsed without habits, and never subscribed', () => {
    expect(paywallHeaderCopy({ summary: ended, pausedHabits: 0, source: 'me' }).title).toBe(
      'Resubscribe to Ante Pro.',
    );
    expect(paywallHeaderCopy({ summary: null, pausedHabits: 0, source: 'daily' }).title).toBe(
      'Put something on the line.',
    );
  });
});
