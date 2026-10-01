import { DAY_ENDS_AT_HOUR } from '@/convex/lib/days';

/**
 * Day keys are `YYYY-MM-DD` in the device's local time. The client is the
 * only place they are minted, so the day boundary always matches what the user
 * sees on their clock rather than UTC. A habit day ends at `DAY_ENDS_AT_HOUR`
 * (3 AM), not midnight: `todayKey` and `dayKeyAt` know that, `toDayKey` is the
 * plain calendar date.
 */

export function toDayKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** The habit day at `at`: the small hours before 3 AM still belong to the day before. */
export function dayKeyAt(at: number): string {
  const date = new Date(at);
  if (date.getHours() < DAY_ENDS_AT_HOUR) date.setDate(date.getDate() - 1);
  return toDayKey(date);
}

export function todayKey(): string {
  return dayKeyAt(Date.now());
}

/** "Thursday to Wednesday": the days a weekly habit started on `startDay` runs, week after week. */
export function describeWeekSpan(startDay: string): string {
  const first = fromDayKey(startDay);
  const last = fromDayKey(startDay);
  last.setDate(last.getDate() + 6);
  return `${weekdayName.format(first)} to ${weekdayName.format(last)}`;
}

const weekdayName = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

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

/** When `day` ends, at 3 AM the next morning: the deadline for anything due on `day`. */
export function endOfDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number);

  return new Date(year, month - 1, date + 1, DAY_ENDS_AT_HOUR).getTime();
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

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

/**
 * When something already happened, as the end of a sentence: "today at 6:12 PM",
 * "yesterday at 9:00 AM", "on Monday", "on Sep 12".
 */
export function describeWhen(at: number, now: number): string {
  const day = toDayKey(new Date(at));
  const today = toDayKey(new Date(now));
  const time = timeFormat.format(new Date(at));
  if (day === today) return `today at ${time}`;
  if (day === toDayKey(new Date(endOfDay(today) - 36 * HOUR))) return `yesterday at ${time}`;
  if (now - at < 6 * DAY) return `on ${weekdayFormat.format(new Date(at))}`;
  return `on ${formatShortDate(at)}`;
}

/** Time left before a deadline, rounded to what matters: "3 hours left", "15 days left". */
export function describeTimeLeft(dueAt: number, now: number): string {
  const remaining = dueAt - now;
  if (remaining < DAY) return describeDueAt(dueAt, now);
  return `${pluralize(Math.floor(remaining / DAY), 'day')} left`;
}
