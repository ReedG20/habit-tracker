import { describe, expect, test } from 'vitest';

import { cleanPhotoOrigin, describePhotoOrigins } from './photoOrigin';

const NOW = Date.UTC(2026, 9, 1, 12);
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe('describePhotoOrigins', () => {
  test('says an in-app camera shot was just taken', () => {
    expect(describePhotoOrigins([{ source: 'camera' }], NOW)).toBe(
      'Photo 1: taken with the in-app camera moments ago.',
    );
  });

  test('gives a library photo its camera and age', () => {
    expect(
      describePhotoOrigins(
        [{ source: 'library', takenAt: NOW - 2 * HOUR_MS, device: 'Apple iPhone 15 Pro' }],
        NOW,
      ),
    ).toBe(
      'Photo 1: picked from the photo library; camera metadata says Apple iPhone 15 Pro, taken 2 hours ago.',
    );
  });

  test('flags a library photo with no camera metadata', () => {
    expect(describePhotoOrigins([{ source: 'library' }], NOW)).toBe(
      'Photo 1: picked from the photo library with no camera metadata, so it may be a screenshot, a saved or downloaded image, or a photo someone else sent.',
    );
  });

  test('notes a missing date when only the camera is known', () => {
    expect(describePhotoOrigins([{ source: 'library', device: 'Google Pixel 8' }], NOW)).toBe(
      'Photo 1: picked from the photo library; camera metadata says Google Pixel 8, no time taken.',
    );
  });

  test('numbers several photos in order', () => {
    expect(
      describePhotoOrigins(
        [{ source: 'camera' }, { source: 'library', takenAt: NOW - 3 * 24 * HOUR_MS }],
        NOW,
      ).split('\n'),
    ).toEqual([
      'Photo 1: taken with the in-app camera moments ago.',
      'Photo 2: picked from the photo library; camera metadata says taken 3 days ago.',
    ]);
  });

  test('says so when the app reported nothing', () => {
    expect(describePhotoOrigins(undefined, NOW)).toBe(
      'Where the photos came from was not reported.',
    );
  });

  test.each([
    [MINUTE_MS, 'moments ago'],
    [20 * MINUTE_MS, '20 minutes ago'],
    [90 * MINUTE_MS, 'an hour ago'],
    [30 * HOUR_MS, 'a day ago'],
  ])('puts an age of %i ms as "%s"', (elapsed, phrase) => {
    expect(describePhotoOrigins([{ source: 'library', takenAt: NOW - elapsed }], NOW)).toContain(
      `taken ${phrase}.`,
    );
  });
});

describe('cleanPhotoOrigin', () => {
  test('drops metadata a camera shot should not carry', () => {
    expect(cleanPhotoOrigin({ source: 'camera', takenAt: 1, device: 'Phone' })).toStrictEqual({
      source: 'camera',
    });
  });

  test('trims and caps the device name', () => {
    const cleaned = cleanPhotoOrigin({ source: 'library', device: `  ${'x'.repeat(200)}  ` });
    expect(cleaned.device).toHaveLength(80);
  });

  test('drops a blank device name', () => {
    expect(cleanPhotoOrigin({ source: 'library', device: '   ' })).toStrictEqual({
      source: 'library',
    });
  });
});
