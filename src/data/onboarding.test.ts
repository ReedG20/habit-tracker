import { describe, expect, test } from 'vitest';

import { defaultDueAt, MIN_LEAD_MS } from '@/components/commitment/draft';

import { freshDueAt, shouldShowOnboarding, suggestKind, suggestionsFor } from './onboarding';

describe('shouldShowOnboarding', () => {
  test('a fresh install that has never written the flag sees it', () => {
    expect(shouldShowOnboarding(null, false)).toBe(true);
  });

  test('a signed-in user from before onboarding existed never does', () => {
    expect(shouldShowOnboarding(null, true)).toBe(false);
  });

  test('a replay shows it whether or not you are signed in', () => {
    expect(shouldShowOnboarding('new', true)).toBe(true);
    expect(shouldShowOnboarding('new', false)).toBe(true);
  });

  test('a drafted commitment keeps the flow up across sign-in', () => {
    expect(shouldShowOnboarding('drafted', false)).toBe(true);
    expect(shouldShowOnboarding('drafted', true)).toBe(true);
  });

  test('done hides it on both sides of the auth guard', () => {
    expect(shouldShowOnboarding('done', false)).toBe(false);
    expect(shouldShowOnboarding('done', true)).toBe(false);
  });
});

describe('suggestKind', () => {
  test('defaults to a habit', () => {
    expect(suggestKind({ areas: [] })).toBe('habit');
    expect(suggestKind({ areas: ['fitness'], history: 'fades' })).toBe('habit');
  });

  test('people who struggle to start, or want a stretch, get a goal', () => {
    expect(suggestKind({ areas: [], history: 'never_start' })).toBe('goal');
    expect(suggestKind({ areas: [], history: 'consistent' })).toBe('goal');
  });

  test('a streak motivator always wins', () => {
    expect(suggestKind({ areas: [], history: 'never_start', motivator: 'streak' })).toBe('habit');
  });
});

describe('suggestionsFor', () => {
  test('round-robins so each area leads with its best suggestion', () => {
    const titles = suggestionsFor(['fitness', 'learning'], 'habit').map((s) => s.title);
    expect(titles).toEqual([
      'Work out for 20 minutes',
      'Read 10 pages',
      'Walk 8,000 steps',
      'Practise a language for 15 minutes',
    ]);
  });

  test('respects the limit', () => {
    expect(suggestionsFor(['fitness', 'health', 'focus', 'money', 'mind'], 'goal', 3)).toHaveLength(
      3,
    );
  });

  test('falls back to broad picks for "something else" or nothing', () => {
    expect(suggestionsFor(['other'], 'habit').length).toBeGreaterThan(0);
    expect(suggestionsFor([], 'goal')[0]?.title).toBe('Run a 5K');
  });
});

describe('freshDueAt', () => {
  const now = new Date(2026, 8, 23, 12).getTime();

  test('keeps a deadline that is still ahead', () => {
    const due = now + 2 * MIN_LEAD_MS;
    expect(freshDueAt(due, now)).toBe(due);
  });

  test('rolls a stale deadline forward to tomorrow evening', () => {
    expect(freshDueAt(now - 1000, now)).toBe(defaultDueAt(now));
    expect(new Date(defaultDueAt(now)).getHours()).toBe(21);
  });
});
