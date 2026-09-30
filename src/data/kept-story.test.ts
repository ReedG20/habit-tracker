import { describe, expect, test } from 'vitest';

import { keptStory } from './kept-story';

import type { Kept } from '@/convex/accomplishments';
import type { Id } from '@/convex/_generated/dataModel';

const DAY = 24 * 60 * 60 * 1000;

function kept(fields: Partial<Kept>): Kept {
  return {
    _id: 'kept1' as Id<'accomplishments'>,
    kind: 'habit',
    title: 'Meditate',
    stake: null,
    achievedAt: Date.UTC(2026, 9, 2),
    seen: false,
    ...fields,
  };
}

const run = {
  unit: 'day' as const,
  streak: 34,
  completions: 34,
  sinceDay: '2026-08-28',
  lastDay: '2026-10-01',
  timesPerWeek: 7,
};

const money = {
  kind: 'money',
  _id: 'stake1',
  status: 'released',
  amountCents: 2000,
} as unknown as Kept['stake'];

describe('keptStory', () => {
  test('a habit headlines its run and credits the stake it never cost', () => {
    const story = keptStory(kept({ run, stake: money }));
    expect(story.kicker).toBe('Kept');
    expect(story.headline).toEqual({ kind: 'count', count: 34, unit: 'days' });
    expect(story.line).toBe('You kept Meditate going for 34 days, right to the last day.');
    expect(story.stakeLine).toBe('$20 stayed on your card.');
    expect(story.dots).toEqual({ count: 34, unit: 'day' });
  });

  test('a weekly habit says how often', () => {
    const story = keptStory(
      kept({ run: { ...run, unit: 'week', streak: 6, completions: 18, timesPerWeek: 3 } }),
    );
    expect(story.headline).toEqual({ kind: 'count', count: 6, unit: 'weeks' });
    expect(story.line).toContain('for 6 weeks, 3 a week');
  });

  test('a run with no streak still counts its logs', () => {
    const story = keptStory(kept({ run: { ...run, streak: 0, completions: 1 } }));
    expect(story.headline).toEqual({ kind: 'count', count: 1, unit: 'log' });
    expect(story.dots).toBeNull();
  });

  test('just their word is still kept', () => {
    expect(keptStory(kept({ run })).stakeLine).toContain('your word, and you kept it');
  });

  test('a goal says how early it landed', () => {
    const achievedAt = Date.UTC(2026, 9, 2);
    const story = keptStory(
      kept({ kind: 'goal', title: 'Ship', dueAt: achievedAt + 3 * DAY + 1000, achievedAt }),
    );
    expect(story.kicker).toBe('Kept');
    expect(story.headline).toEqual({ kind: 'words', text: 'Done.' });
    expect(story.line).toMatch(/^You proved Ship by .+, 3 days early\.$/);
  });
});
