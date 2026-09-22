/**
 * Day keys are `YYYY-MM-DD` in the device's local calendar. The client is the
 * only place they are minted, so the day boundary always matches what the user
 * sees on their clock rather than UTC.
 */

export function toDayKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function todayKey(): string {
  return toDayKey(new Date());
}

/** Midday, so DST shifts can't roll the date backwards when formatting. */
export function fromDayKey(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);

  return new Date(year, month - 1, date, 12);
}

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

export function formatCompletedAt(completedAt: number): { date: string; time: string } {
  const at = new Date(completedAt);

  return { date: dayFormat.format(at), time: timeFormat.format(at) };
}

export function formatDayKey(day: string): string {
  return dayFormat.format(fromDayKey(day));
}

/** The first instant of the following day, i.e. the deadline for anything due on `day`. */
export function endOfDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number);

  return new Date(year, month - 1, date + 1).getTime();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "in 4 hours" / "in 12 minutes" until `deadlineAt`; `null` once it has passed. */
export function describeCountdown(deadlineAt: number, now: number): string | null {
  const remaining = deadlineAt - now;
  if (remaining <= 0) return null;

  if (remaining < HOUR) {
    const minutes = Math.max(1, Math.round(remaining / MINUTE));
    return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  const hours = Math.floor(remaining / HOUR);
  return `in ${hours} hour${hours === 1 ? '' : 's'}`;
}

const DAY = 24 * HOUR;

const dueAtFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Tue, Oct 3, 6:00 PM" — the full deadline for detail rows and pickers. */
export function formatDueAt(dueAt: number): string {
  return dueAtFormat.format(new Date(dueAt));
}

const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** "Oct 3" — a date without a time, for renewal and expiry lines. */
export function formatShortDate(at: number): string {
  return shortDateFormat.format(new Date(at));
}

function pluralize(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * Relative wording for a deadline: counts down inside a day, names the day
 * inside a week, and says how long ago it was missed once it has passed.
 */
export function describeDueAt(dueAt: number, now: number): string {
  const remaining = dueAt - now;

  if (remaining <= 0) {
    const overdue = -remaining;
    if (overdue < HOUR) return 'Missed just now';
    if (overdue < DAY) return `Missed ${pluralize(Math.floor(overdue / HOUR), 'hour')} ago`;
    return `Missed ${pluralize(Math.floor(overdue / DAY), 'day')} ago`;
  }

  if (remaining < HOUR) {
    return `Due in ${pluralize(Math.max(1, Math.round(remaining / MINUTE)), 'minute')}`;
  }
  if (remaining < DAY) {
    return `Due in ${pluralize(Math.floor(remaining / HOUR), 'hour')}`;
  }

  const dueDay = toDayKey(new Date(dueAt));
  const time = timeFormat.format(new Date(dueAt));
  if (dueDay === toDayKey(new Date(now + DAY))) return `Due tomorrow at ${time}`;

  return `Due ${formatDueAt(dueAt)}`;
}
