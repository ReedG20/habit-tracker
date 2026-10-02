import { describe, expect, test } from 'vitest';

import { stakeHeroSize } from './card-layout';

describe('stakeHeroSize', () => {
  test('a lockout fits without breaking “locked”', () => {
    // At the old 84pt, “LOCKED” ran 308pt wide in a 304pt column and split.
    expect(stakeHeroSize('1 day locked')).toBeLessThan(80);
    expect(stakeHeroSize('7 days locked')).toBeLessThan(80);
  });

  test('short heroes still fill the card', () => {
    expect(stakeHeroSize('$250')).toBe(84);
    expect(stakeHeroSize('My word')).toBeGreaterThanOrEqual(80);
  });

  test('wide words shrink to fit', () => {
    expect(stakeHeroSize('A friend')).toBeLessThanOrEqual(84);
    expect(stakeHeroSize('Money')).toBeLessThanOrEqual(84);
  });

  test('a long hero stays within two lines', () => {
    // Words that fit alone but would take three lines at full size.
    expect(stakeHeroSize('one two three four five six')).toBeLessThan(60);
  });
});
