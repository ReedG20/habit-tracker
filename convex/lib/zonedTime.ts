/**
 * Wall-clock math in an IANA zone, for placing reminders at local times.
 * Pure and free of Convex imports, so the app can share it.
 *
 * Day keys are `YYYY-MM-DD`, the same keys `lib/days.ts` does arithmetic on.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

// Building a formatter is far slower than using one, and the planner asks the
// same zone dozens of times per run.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timeZone);
  if (cached === undefined) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, cached);
  }
  return cached;
}

function localParts(at: number, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? '0');

  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    // Some runtimes still print midnight as 24 under h23.
    hour: part('hour') % 24,
    minute: part('minute'),
  };
}

function dayKey({ year, month, day }: LocalParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The local calendar day at `at`, as a `YYYY-MM-DD` key. */
export function zonedDay(at: number, timeZone: string): string {
  return dayKey(localParts(at, timeZone));
}

/** Minutes since local midnight at `at`: 0 to 1439. */
export function localClock(at: number, timeZone: string): number {
  const { hour, minute } = localParts(at, timeZone);
  return hour * 60 + minute;
}

/** How far the zone's wall clock runs ahead of UTC at `at`, in ms. */
function offsetAt(at: number, timeZone: string): number {
  const parts = localParts(at, timeZone);
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return wall - Math.floor(at / MINUTE_MS) * MINUTE_MS;
}

/**
 * The instant the zone's wall clock reads `hour:minute` on `day`. A time that
 * a DST jump skips lands within an hour of it, which is close enough for a nudge.
 */
export function zonedInstant(day: string, hour: number, minute: number, timeZone: string): number {
  const [year, month, date] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);

  // Two passes: the first guess can sit on the other side of a transition.
  let at = wall - offsetAt(wall, timeZone);
  at = wall - offsetAt(at, timeZone);
  return at;
}

/**
 * The first instant after `now` that falls on a later local day: when a
 * habit's day is up. Searched rather than computed, because some zones skip
 * local midnight on their DST day, and days run 23 to 25 hours.
 */
export function nextLocalMidnight(now: number, timeZone: string): number {
  const today = zonedDay(now, timeZone);

  // Whole minutes: every real zone changes offset on a minute boundary.
  let low = Math.floor(now / MINUTE_MS);
  let high = low + 26 * 60;
  while (zonedDay(high * MINUTE_MS, timeZone) === today) {
    high += 24 * 60;
  }

  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (zonedDay(middle * MINUTE_MS, timeZone) === today) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return high * MINUTE_MS;
}

export { HOUR_MS, MINUTE_MS };
