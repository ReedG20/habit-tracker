import type { PhotoOrigin } from '@/convex/lib/photoOrigin';
import { PHOTO_CLOCK_SKEW_MS } from '@/convex/lib/photoOrigin';
import { dayKeyAt } from '@/lib/dates';

export type { PhotoOrigin };

/**
 * Where a proof photo came from (`convex/lib/photoOrigin.ts`). Library photos
 * are allowed, but only fresh ones from the user's own camera should pass, so
 * the picker reads the photo's EXIF: a camera shot carries when and on what it
 * was taken, while screenshots and most saved images carry neither.
 */

export const CAMERA_ORIGIN: PhotoOrigin = { source: 'camera' };

/** EXIF as expo-image-picker hands it over: one flat object on iOS and Android. */
type Exif = Record<string, unknown>;

function exifString(exif: Exif, key: string): string | undefined {
  const value = exif[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * EXIF dates are `YYYY:MM:DD HH:MM:SS` in the camera's local time, with the
 * UTC offset (`+02:00`) in a separate tag on newer phones. Without the offset
 * the device's own zone is the best guess.
 */
export function parseExifDate(value: string, offset: string | undefined): number | undefined {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (match === null) return undefined;
  const [, year, month, day, hour, minute, second] = match;

  if (offset !== undefined && /^[+-]\d{2}:\d{2}$/.test(offset)) {
    const at = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`);
    return Number.isNaN(at) ? undefined : at;
  }

  const at = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ).getTime();
  return Number.isNaN(at) ? undefined : at;
}

/** A library pick's origin, from the EXIF the picker read with `exif: true`. */
export function originFromExif(exif: Exif | null | undefined): PhotoOrigin {
  // iOS screenshots carry an EXIF block of their own; it says nothing about a camera.
  if (exif == null || exifString(exif, 'UserComment') === 'Screenshot') {
    return { source: 'library' };
  }

  const original = exifString(exif, 'DateTimeOriginal');
  const takenAt =
    original === undefined
      ? undefined
      : parseExifDate(original, exifString(exif, 'OffsetTimeOriginal'));

  const make = exifString(exif, 'Make');
  const model = exifString(exif, 'Model');
  // Models usually repeat the make ("Apple" + "iPhone 15 Pro" is fine, but
  // "Google" + "Google Pixel 8" is not).
  const device =
    model !== undefined && make !== undefined && !model.startsWith(make)
      ? `${make} ${model}`
      : (model ?? make);

  return { source: 'library', takenAt, device };
}

/** A habit's photo is from today's habit day, or has no date to check (the model judges those). */
export function isFreshForHabit(origin: PhotoOrigin, today: string): boolean {
  return origin.takenAt === undefined || dayKeyAt(origin.takenAt) === today;
}

/** A goal's photo is from after the goal was made, or has no date to check. */
export function isFreshForGoal(origin: PhotoOrigin, goalCreatedAt: number): boolean {
  return origin.takenAt === undefined || origin.takenAt >= goalCreatedAt - PHOTO_CLOCK_SKEW_MS;
}
