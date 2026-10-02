/**
 * Second thoughts: a new commitment can be called off, or its terms changed,
 * for a short while after it is signed. The window always closes before
 * anything has been judged, so it dodges nothing; it only forgives a typo'd
 * deadline or a stake picked in a rush. A swap keeps the original window, so
 * it can never be stretched by changing the terms again.
 *
 * Pure and free of Convex imports, so the app can say the time up front.
 */
import { nextDay } from './days';
import { HOUR_MS, MINUTE_MS, localClock, nextDayEnd, zonedDay, zonedInstant } from './zonedTime';

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

/** A friend's heads-up never lands overnight: from this hour… */
export const HEADS_UP_QUIET_FROM_HOUR = 22;
/** …it waits for this one. */
export const HEADS_UP_MORNING_HOUR = 8;

/**
 * When the friend on a new commitment's stake is emailed. It waits for the
 * call-off window, so nobody hears about one taken back. A habit's window
 * closes at the 3 AM day boundary, though, so a heads-up that would land
 * between 10 PM and 8 AM in the user's zone goes out at 8 AM instead.
 * Without a window (a stake raised on a running commitment) it goes now,
 * while the user is up. A goal's friend always hears before the deadline,
 * so when morning is too late it goes when the window closes.
 */
export function friendHeadsUpAt(
  callOffUntil: number | undefined,
  now: number,
  timeZone: string | undefined,
  dueAt?: number,
): number {
  const at = Math.max(now, callOffUntil ?? 0);
  if (callOffUntil === undefined || timeZone === undefined) return at;

  let hour: number;
  let day: string;
  try {
    hour = Math.floor(localClock(at, timeZone) / 60);
    day = zonedDay(at, timeZone);
  } catch {
    // An unknown zone: no way to tell night from day.
    return at;
  }
  if (hour >= HEADS_UP_MORNING_HOUR && hour < HEADS_UP_QUIET_FROM_HOUR) return at;

  const morningDay = hour >= HEADS_UP_QUIET_FROM_HOUR ? nextDay(day) : day;
  const morning = zonedInstant(morningDay, HEADS_UP_MORNING_HOUR, 0, timeZone);
  return dueAt !== undefined && morning >= dueAt ? at : morning;
}
