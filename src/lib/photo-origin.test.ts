import { describe, expect, test } from 'vitest';

import { isFreshForGoal, isFreshForHabit, originFromExif, parseExifDate } from './photo-origin';

/** Local time, the way the camera and the habit day both count it. */
const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();

describe('parseExifDate', () => {
  test('uses the offset when the camera recorded one', () => {
    expect(parseExifDate('2026:10:01 07:30:00', '-07:00')).toBe(Date.UTC(2026, 9, 1, 14, 30));
  });

  test('falls back to device-local time without one', () => {
    expect(parseExifDate('2026:10:01 07:30:00', undefined)).toBe(local(1, 7, 30));
  });

  test('ignores a malformed offset', () => {
    expect(parseExifDate('2026:10:01 07:30:00', 'local')).toBe(local(1, 7, 30));
  });

  test('gives up on a malformed date', () => {
    expect(parseExifDate('yesterday', undefined)).toBeUndefined();
  });
});

describe('originFromExif', () => {
  test('reads when and on what an iPhone photo was taken', () => {
    expect(
      originFromExif({
        DateTimeOriginal: '2026:10:01 07:30:00',
        OffsetTimeOriginal: '+00:00',
        Make: 'Apple',
        Model: 'iPhone 15 Pro',
      }),
    ).toEqual({
      source: 'library',
      takenAt: Date.UTC(2026, 9, 1, 7, 30),
      device: 'Apple iPhone 15 Pro',
    });
  });

  test('does not repeat a make the model already names', () => {
    expect(originFromExif({ Make: 'Google', Model: 'Google Pixel 8' }).device).toBe(
      'Google Pixel 8',
    );
  });

  test('has nothing to say about a photo without EXIF', () => {
    expect(originFromExif(undefined)).toEqual({ source: 'library' });
    expect(originFromExif(null)).toEqual({ source: 'library' });
  });

  test('treats an iOS screenshot as having no camera metadata', () => {
    expect(
      originFromExif({ UserComment: 'Screenshot', DateTimeOriginal: '2026:10:01 07:30:00' }),
    ).toEqual({ source: 'library' });
  });

  test('ignores values that are not strings', () => {
    expect(originFromExif({ DateTimeOriginal: 42, Make: '' })).toEqual({
      source: 'library',
      takenAt: undefined,
      device: undefined,
    });
  });
});

describe('isFreshForHabit', () => {
  const today = '2026-10-01';

  test('takes a photo from earlier today', () => {
    expect(isFreshForHabit({ source: 'library', takenAt: local(1, 7) }, today)).toBe(true);
  });

  test('refuses one from yesterday', () => {
    expect(
      isFreshForHabit({ source: 'library', takenAt: new Date(2026, 8, 30, 20).getTime() }, today),
    ).toBe(false);
  });

  test('counts the small hours as the day before, like the habit day', () => {
    expect(isFreshForHabit({ source: 'library', takenAt: local(2, 2) }, today)).toBe(true);
    expect(isFreshForHabit({ source: 'library', takenAt: local(1, 2) }, today)).toBe(false);
  });

  test('leaves an undated photo to the check', () => {
    expect(isFreshForHabit({ source: 'library' }, today)).toBe(true);
  });
});

describe('isFreshForGoal', () => {
  const createdAt = local(1, 9);

  test('takes a photo from after the goal was made', () => {
    expect(isFreshForGoal({ source: 'library', takenAt: local(3, 9) }, createdAt)).toBe(true);
  });

  test('refuses one from before', () => {
    expect(isFreshForGoal({ source: 'library', takenAt: local(1, 8) }, createdAt)).toBe(false);
  });

  test('allows a few minutes of clock skew', () => {
    expect(isFreshForGoal({ source: 'library', takenAt: local(1, 8, 58) }, createdAt)).toBe(true);
  });

  test('leaves an undated photo to the check', () => {
    expect(isFreshForGoal({ source: 'library' }, createdAt)).toBe(true);
  });
});
