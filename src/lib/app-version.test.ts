import { describe, expect, test } from 'vitest';

import {
  AWAY_BEFORE_RELOAD_MS,
  isBelowMinimum,
  parseBuild,
  shouldApplyUpdate,
} from './app-version';

describe('parseBuild', () => {
  test('reads a plain build number', () => {
    expect(parseBuild('42')).toBe(42);
    expect(parseBuild(' 7 ')).toBe(7);
  });

  test('is null for anything else', () => {
    expect(parseBuild(null)).toBeNull();
    expect(parseBuild(undefined)).toBeNull();
    expect(parseBuild('')).toBeNull();
    expect(parseBuild('1.0.0')).toBeNull();
  });
});

describe('isBelowMinimum', () => {
  test('gates an older build', () => {
    expect(isBelowMinimum(41, 42)).toBe(true);
  });

  test('lets the minimum and newer through', () => {
    expect(isBelowMinimum(42, 42)).toBe(false);
    expect(isBelowMinimum(43, 42)).toBe(false);
  });

  test('fails open without both numbers', () => {
    expect(isBelowMinimum(null, 42)).toBe(false);
    expect(isBelowMinimum(41, null)).toBe(false);
  });
});

describe('shouldApplyUpdate', () => {
  const away = AWAY_BEFORE_RELOAD_MS;

  test('applies a pending update after a long absence', () => {
    expect(shouldApplyUpdate({ pending: true, awayMs: away, pathname: '/' })).toBe(true);
    expect(shouldApplyUpdate({ pending: true, awayMs: away, pathname: '/me' })).toBe(true);
  });

  test('waits when nothing is downloaded or the absence was short', () => {
    expect(shouldApplyUpdate({ pending: false, awayMs: away, pathname: '/' })).toBe(false);
    expect(shouldApplyUpdate({ pending: true, awayMs: away - 1, pathname: '/' })).toBe(false);
  });

  test('never interrupts a flow', () => {
    for (const pathname of ['/new', '/onboarding/focus', '/raise', '/restart/abc', '/pro']) {
      expect(shouldApplyUpdate({ pending: true, awayMs: away, pathname })).toBe(false);
    }
  });

  test('matches whole path segments only', () => {
    expect(shouldApplyUpdate({ pending: true, awayMs: away, pathname: '/progress' })).toBe(true);
  });
});
