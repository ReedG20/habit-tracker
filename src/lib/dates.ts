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

/** Relative wording for a due date, falling back to the formatted date. */
export function describeDueDay(dueDay: string, today: string): string {
  if (dueDay === today) return 'Due today';

  const dueAt = fromDayKey(dueDay).getTime();
  const todayAt = fromDayKey(today).getTime();
  const days = Math.round((dueAt - todayAt) / 86_400_000);

  if (days === 1) return 'Due tomorrow';
  if (days === -1) return 'Overdue by 1 day';
  if (days < -1) return `Overdue by ${-days} days`;
  if (days <= 7) return `Due in ${days} days`;

  return `Due ${formatDayKey(dueDay)}`;
}

export function isOverdue(dueDay: string, today: string): boolean {
  return dueDay < today;
}
