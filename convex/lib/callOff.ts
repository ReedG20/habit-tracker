/**
 * Second thoughts: a new commitment can be called off, or its terms changed,
 * for a short while after it is signed. The window always closes before
 * anything has been judged, so it dodges nothing; it only forgives a typo'd
 * deadline or a stake picked in a rush. A swap keeps the original window, so
 * it can never be stretched by changing the terms again.
 *
 * Pure and free of Convex imports, so the app can say the time up front.
 */
import { HOUR_MS, MINUTE_MS, nextDayEnd } from './zonedTime';

/** A goal's window is this share of its length… */
export const CALL_OFF_SHARE = 0.1;
/** …never shorter than this, enough to fix a typo… */
export const MIN_CALL_OFF_MS = 15 * MINUTE_MS;
/** …and never longer than a day, enough to sleep on it. */
export const MAX_CALL_OFF_MS = 24 * HOUR_MS;

/**
 * When a goal made at `createdAt` and due at `dueAt` can no longer be called
 * off: a tenth of its length, kept between 15 minutes and a day, and never
 * past its halfway point, so a very short goal still mostly counts.
 */
export function goalCallOffUntil(createdAt: number, dueAt: number): number {
  const length = Math.max(0, dueAt - createdAt);
  const share = Math.min(Math.max(length * CALL_OFF_SHARE, MIN_CALL_OFF_MS), MAX_CALL_OFF_MS);
  return createdAt + Math.min(share, length / 2);
}

/**
 * When a habit made at `createdAt` can no longer be called off: when day one
 * starts (the day it was made is never judged), but never less than 15
 * minutes, so one made just before the day ends still gets a moment.
 */
export function habitCallOffUntil(createdAt: number, timeZone: string | undefined): number {
  const floor = createdAt + MIN_CALL_OFF_MS;
  if (timeZone === undefined) return floor;
  let dayOne: number;
  try {
    dayOne = nextDayEnd(createdAt, timeZone);
  } catch {
    // An unknown zone: nothing better to go on than the floor.
    return floor;
  }
  return Math.min(Math.max(dayOne, floor), createdAt + MAX_CALL_OFF_MS);
}

/** Whether a commitment with this window can still be called off at `now`. */
export function isCallOffOpen(callOffUntil: number | undefined, now: number): boolean {
  return callOffUntil !== undefined && now < callOffUntil;
}
