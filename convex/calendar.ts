import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { frozenDaysBetween } from './freezes';
import { getCurrentUserOrNull } from './lib/auth';
import { daysBefore, daysBetween, nextDay } from './lib/days';
import { DAILY, targetPerWeek } from './lib/frequency';
import { localDay } from './lib/lockout';

/**
 * How a past day went, for the Me screen's calendar:
 * - `full`: something was logged and no daily habit was left undone.
 * - `partial`: something was logged, but a daily habit was left undone.
 * - `missed`: nothing was logged on a day a daily habit was due.
 * - `frozen`: nothing was logged, and the habits were frozen anyway.
 * - `none`: nothing was due and nothing was logged (or today, still open).
 */
const dayStateValidator = v.union(
  v.literal('full'),
  v.literal('partial'),
  v.literal('missed'),
  v.literal('frozen'),
  v.literal('none'),
);

export type CalendarDayState = 'full' | 'partial' | 'missed' | 'frozen' | 'none';

const MAX_HABITS = 200;
const MAX_COMPLETIONS = 5000;

/** Every day `habit` was due, as a daily habit, is between these (inclusive). */
function dueWindow(habit: Doc<'habits'>, timeZone: string): { from: string; to?: string } {
  // Never checked on the day it was made.
  const from = nextDay(localDay(habit._creationTime, timeZone));
  const ends: string[] = [];
  if (habit.endsAfter !== undefined) ends.push(habit.endsAfter);
  if (habit.brokenAt !== undefined) ends.push(localDay(habit.brokenAt, timeZone));
  return { from, to: ends.sort()[0] };
}

/**
 * One month of the calendar, `month` as `YYYY-MM`. Like `habits.list`, `today`
 * comes from the client so the day boundary follows the device clock. Days
 * after `today` are left out.
 */
export const month = query({
  args: { month: v.string(), today: v.string() },
  returns: v.object({
    /** Where history starts: the calendar goes back no further. */
    firstDay: v.string(),
    days: v.array(v.object({ day: v.string(), state: dayStateValidator })),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) {
      return { firstDay: args.today, days: [] };
    }

    const timeZone = user.timeZone ?? 'UTC';
    // The day the account was made, or the first log if that is earlier
    // (imported history).
    const firstLog = await ctx.db
      .query('habitCompletions')
      .withIndex('by_user_and_day', (q) => q.eq('userId', user._id))
      .first();
    const joined = localDay(user._creationTime, timeZone);
    const firstDay = firstLog !== null && firstLog.day < joined ? firstLog.day : joined;
    const monthStart = `${args.month}-01`;
    // The day before the 1st of next month.
    const [year, monthNumber] = args.month.split('-').map(Number);
    const following =
      monthNumber === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`;
    const monthEnd = daysBefore(following, 1);
    const lastDay = monthEnd < args.today ? monthEnd : args.today;
    if (lastDay < monthStart) {
      return { firstDay, days: [] };
    }

    const habits = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(MAX_HABITS);
    const dailyWindows = habits
      .filter((habit) => targetPerWeek(habit) >= DAILY)
      .map((habit) => ({ habitId: habit._id, ...dueWindow(habit, timeZone) }));

    const completions = await ctx.db
      .query('habitCompletions')
      .withIndex('by_user_and_day', (q) =>
        q.eq('userId', user._id).gte('day', monthStart).lte('day', lastDay),
      )
      .take(MAX_COMPLETIONS);
    const loggedByDay = new Map<string, Set<Id<'habits'>>>();
    for (const completion of completions) {
      const logged = loggedByDay.get(completion.day) ?? new Set<Id<'habits'>>();
      logged.add(completion.habitId);
      loggedByDay.set(completion.day, logged);
    }

    const frozen = await frozenDaysBetween(ctx, user._id, monthStart, lastDay);

    const days = daysBetween(monthStart, lastDay).map((day) => {
      const logged = loggedByDay.get(day) ?? new Set<Id<'habits'>>();
      const due = dailyWindows.filter(
        (window) => window.from <= day && (window.to === undefined || day <= window.to),
      );
      const allDone = due.every((window) => logged.has(window.habitId));

      let state: CalendarDayState;
      if (logged.size > 0) state = allDone ? 'full' : 'partial';
      else if (frozen.has(day)) state = 'frozen';
      else if (due.length > 0 && day !== args.today) state = 'missed';
      else state = 'none';

      return { day, state };
    });

    return { firstDay, days };
  },
});
