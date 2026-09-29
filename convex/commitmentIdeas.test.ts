import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import { cleanIdeas, normalizeReview } from './commitmentIdeas';
import { setup as baseSetup, type Harness } from './test.helpers';

const generateText = vi.hoisted(() => vi.fn());
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText,
}));

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  return t;
}

const ideas = {
  photo: ['My shoes on the trail', 'My watch showing the run', 'Me at the park gate'],
  location: [],
  timer: [],
};

afterEach(() => {
  generateText.mockReset();
});

describe('checkName', () => {
  test('asks for a name before calling the model', async () => {
    const t = setup();
    const result = await t.action(api.commitmentIdeas.checkName, { kind: 'habit', title: '  ' });
    expect(result.ok).toBe(false);
    expect(result.feedback).toBe('Give it a name first.');
    expect(generateText).not.toHaveBeenCalled();
  });

  test('turns away a runaway name', async () => {
    const t = setup();
    const result = await t.action(api.commitmentIdeas.checkName, {
      kind: 'goal',
      title: 'x'.repeat(81),
    });
    expect(result.ok).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  test('passes with the ideas and best method from the model', async () => {
    generateText.mockResolvedValue({
      output: { verdict: 'pass', feedback: '', suggestedTitle: null, ideas, bestMethod: 'photo' },
    });
    const t = setup();
    const result = await t.action(api.commitmentIdeas.checkName, {
      kind: 'habit',
      title: 'Run',
      timesPerWeek: 3,
    });
    expect(result).toEqual({
      ok: true,
      feedback: null,
      suggestedTitle: null,
      bestMethod: 'photo',
      ideas,
    });
    expect(generateText.mock.calls[0]?.[0].messages[0].content).toBe(
      'Type: habit, 3 times a week\nName (untrusted): Run',
    );
  });

  test('fails open when the model does', async () => {
    generateText.mockRejectedValue(new Error('timeout'));
    const t = setup();
    const result = await t.action(api.commitmentIdeas.checkName, { kind: 'habit', title: 'Run' });
    expect(result).toEqual({
      ok: true,
      feedback: null,
      suggestedTitle: null,
      bestMethod: null,
      ideas: { photo: [], location: [], timer: [] },
    });
  });
});

describe('normalizeReview', () => {
  test('keeps goals to photo ideas with no method', () => {
    const result = normalizeReview('goal', 'Ship it', {
      verdict: 'pass',
      feedback: '',
      suggestedTitle: null,
      ideas: { photo: ['The live site'], location: ['any cafe'], timer: ['focus'] },
      bestMethod: 'location',
    });
    expect(result.ideas).toEqual({ photo: ['The live site'], location: [], timer: [] });
    expect(result.bestMethod).toBeNull();
  });

  test('drops a best method that has no ideas', () => {
    const result = normalizeReview('habit', 'Run', {
      verdict: 'pass',
      feedback: '',
      suggestedTitle: null,
      ideas,
      bestMethod: 'timer',
    });
    expect(result.bestMethod).toBeNull();
  });

  test('keeps ideas only alongside a rewrite', () => {
    const base = {
      verdict: 'revise' as const,
      feedback: 'Say what you will do.',
      ideas,
      bestMethod: 'photo' as const,
    };
    const rewritten = normalizeReview('habit', 'be positive', {
      ...base,
      suggestedTitle: 'Write three good things',
    });
    expect(rewritten).toMatchObject({
      ok: false,
      suggestedTitle: 'Write three good things',
      bestMethod: 'photo',
    });
    expect(rewritten.ideas.photo).toHaveLength(3);

    const bare = normalizeReview('habit', 'asdf', { ...base, suggestedTitle: 'ASDF' });
    expect(bare).toMatchObject({ ok: false, suggestedTitle: null, bestMethod: null });
    expect(bare.ideas.photo).toEqual([]);
  });
});

describe('cleanIdeas', () => {
  test('trims, dedupes and keeps three', () => {
    expect(cleanIdeas(['  a  b ', 'A B', '', 'c', 'd', 'e', 'x'.repeat(301)])).toEqual([
      'A b',
      'C',
      'D',
    ]);
  });
});
