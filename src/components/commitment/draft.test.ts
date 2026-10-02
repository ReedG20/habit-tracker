import { describe, expect, test } from 'vitest';

import { bestFitPatch, suggestionPatch, type CommitmentSuggestion } from './draft';

const FOCUS: CommitmentSuggestion = {
  title: 'Focus for an hour, phone away',
  proof: 'Work at my desk while my phone sits across the room, Ante running',
  proofMethod: 'timer',
  timerMinutes: 60,
};
const READ: CommitmentSuggestion = {
  title: 'Read 10 pages',
  proof: 'The page I finished on, page number in view',
};

const IDEAS = {
  photo: ['My desk with the laptop open'],
  location: ['Any library or café'],
  timer: ['Work with notifications off'],
};

describe('suggestionPatch', () => {
  test('a habit preset brings its method and timer length', () => {
    expect(suggestionPatch('habit', FOCUS)).toEqual({
      title: FOCUS.title,
      proof: FOCUS.proof,
      proofMethod: 'timer',
      timerMinutes: 60,
    });
  });

  test('a preset with no method is a photo', () => {
    expect(suggestionPatch('habit', READ)).toMatchObject({ proofMethod: 'photo' });
  });

  test('a goal takes only the words: goals are always photos', () => {
    expect(suggestionPatch('goal', READ)).toEqual({ title: READ.title, proof: READ.proof });
  });
});

describe('bestFitPatch', () => {
  const habit = { kind: 'habit' as const, proof: '', proofMethod: 'photo' as const };

  test('with no proof yet, the best fit takes over', () => {
    expect(bestFitPatch(habit, { bestMethod: 'timer', ideas: IDEAS }, [], false)).toEqual({
      proofMethod: 'timer',
    });
  });

  test('a preset’s proof gives way to the best fit’s first idea', () => {
    // The photo-worded preset that used to stay on photo with timer as best fit.
    const draft = { ...habit, proof: READ.proof };
    expect(bestFitPatch(draft, { bestMethod: 'timer', ideas: IDEAS }, [READ], false)).toEqual({
      proofMethod: 'timer',
      proof: 'Work with notifications off',
    });
  });

  test('a preset already on the best fit is left alone', () => {
    const draft = { ...habit, proof: FOCUS.proof, proofMethod: 'timer' as const };
    expect(bestFitPatch(draft, { bestMethod: 'timer', ideas: IDEAS }, [FOCUS], false)).toBeNull();
  });

  test('proof the user wrote, or a method they picked, is never moved', () => {
    const written = { ...habit, proof: 'My own words' };
    expect(bestFitPatch(written, { bestMethod: 'timer', ideas: IDEAS }, [READ], false)).toBeNull();
    expect(bestFitPatch(habit, { bestMethod: 'timer', ideas: IDEAS }, [], true)).toBeNull();
  });

  test('goals and missing best fits change nothing', () => {
    const goal = { ...habit, kind: 'goal' as const };
    expect(bestFitPatch(goal, { bestMethod: 'timer', ideas: IDEAS }, [], false)).toBeNull();
    expect(bestFitPatch(habit, { bestMethod: null, ideas: IDEAS }, [], false)).toBeNull();
  });
});
