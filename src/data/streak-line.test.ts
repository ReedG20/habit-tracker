import { describe, expect, test } from 'vitest';

import { streakLine } from './streak-line';

describe('the streak line under an approved proof', () => {
  test('counts down to the next milestone', () => {
    expect(streakLine(12, 'day')).toBe('12 days in a row · 2 days to 14');
    expect(streakLine(3, 'week')).toBe('3 weeks in a row · 1 week to 4');
  });

  test('says so on the day it lands one, and stays quiet on day one', () => {
    expect(streakLine(30, 'day')).toBe('30 days in a row. That’s a milestone.');
    expect(streakLine(1, 'day')).toBeNull();
    expect(streakLine(400, 'day')).toBe('400 days in a row.');
  });
});
