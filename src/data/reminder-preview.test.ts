import { describe, expect, test } from 'vitest';

import { pickPreviewSubject, previewPushes, SAMPLE_SUBJECT } from './reminder-preview';

const midnight = Date.parse('2026-09-22T00:00:00Z');
const context = { midnight, timeZone: 'UTC' };

describe('previewPushes', () => {
  test('a habit on firm: one nudge, then a time-sensitive last call', () => {
    const pushes = previewPushes(
      { kind: 'habit', title: 'Run' },
      { preset: 'firm', breakThroughFocus: true },
      context,
    );
    expect(pushes.map((push) => [new Date(push.at).toISOString(), push.title])).toEqual([
      ['2026-09-21T19:00:00.000Z', 'Run'],
      ['2026-09-21T22:30:00.000Z', 'Last call: Run'],
    ]);
    expect(pushes.map((push) => push.timeSensitive)).toEqual([false, true]);
  });

  test('without Focus break-through, nothing is time sensitive', () => {
    const pushes = previewPushes(
      { kind: 'habit', title: 'Run' },
      { preset: 'relentless', breakThroughFocus: false },
      context,
    );
    expect(pushes).toHaveLength(4);
    expect(pushes.some((push) => push.timeSensitive)).toBe(false);
  });

  test('a goal uses its own deadline and the money on it', () => {
    const dueAt = Date.parse('2026-09-25T17:00:00Z');
    const pushes = previewPushes(
      {
        kind: 'goal',
        title: 'Essay',
        dueAt,
        createdAt: Date.parse('2026-09-01T00:00:00Z'),
        stakeCents: 2500,
      },
      { preset: 'firm', breakThroughFocus: true },
      context,
    );
    expect(pushes.map((push) => push.title)).toEqual([
      'Essay · due tomorrow 5pm',
      'Essay: 5h left',
      'Last call: Essay',
    ]);
    expect(pushes.at(-1)?.body).toContain('$25');
  });
});

describe('pickPreviewSubject', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');

  test('a habit first, then the next open goal, then a stand-in', () => {
    const goals = [
      { title: 'Later', dueAt: now + 5e8, _creationTime: now },
      { title: 'Sooner', dueAt: now + 1e8, _creationTime: now },
      { title: 'Done', dueAt: now + 1e7, _creationTime: now, completedAt: now },
    ];
    expect(pickPreviewSubject([{ title: 'Run' }], goals, now)).toEqual({
      kind: 'habit',
      title: 'Run',
    });
    expect(pickPreviewSubject([], goals, now)).toMatchObject({ kind: 'goal', title: 'Sooner' });
    expect(pickPreviewSubject(undefined, undefined, now)).toBe(SAMPLE_SUBJECT);
  });
});
