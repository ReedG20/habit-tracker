import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { frozenDaysBetween } from './freezes';
import { daysBefore, previousDay, STREAK_WINDOW_DAYS } from './lib/days';
import { targetPerWeek } from './lib/frequency';
import { weekStartsOn } from './lib/habitWeek';
import { excusedDays, runOf } from './lib/streaks';

/**
 * Reads a habit's streak from the database (the rule itself is in
 * `lib/streaks.ts`). A streak reads back only as far as its run goes: the
 * first window, then twice as far each time the run reaches the window's edge,
 * so a long streak costs about as many rows as it is long, never the habit's
 * whole history.
 */

/** Furthest back a streak looks: ten years, as far as `dailyRun` walks. */
const MAX_LOOKBACK_DAYS = 3660;

/** Bounds each read; a habit logs at most once a day, with a few checks each. */
const MAX_ROWS = 5000;

type Ctx = QueryCtx | MutationCtx;

/** What a caller already read for the first window, so it isn't read twice. */
export type StreakSeed = {
  from: string;
  done: Set<string>;
  excused: Set<string>;
  frozen: Set<string>;
};

/**
 * The habit's current streak: days for a daily habit, weeks that hit the
 * target for the rest. A broken habit's streak is over, and a restart only
 * counts days from its new start.
 */
export async function currentStreak(
  ctx: Ctx,
  habit: Doc<'habits'>,
  today: string,
  seed?: StreakSeed,
): Promise<number> {
  if (habit.brokenAt !== undefined) return 0;
  const { startDay } = habit;
  const counted = (days: Set<string>) =>
    startDay === undefined ? days : new Set([...days].filter((day) => day >= startDay));

  let span = STREAK_WINDOW_DAYS;
  let from = seed?.from ?? daysBefore(today, span);
  const done = new Set(seed?.done);
  const excused = new Set(seed?.excused);
  let frozen = seed?.frozen;
  if (seed === undefined) await readDays(ctx, habit._id, from, today, done, excused);
  frozen ??= await frozenDaysBetween(ctx, habit.userId, from, today);

  const oldest = daysBefore(today, MAX_LOOKBACK_DAYS);
  for (;;) {
    const { streak, reachesFrom } = runOf({
      target: targetPerWeek(habit),
      startsOn: weekStartsOn(habit),
      done: counted(done),
      excused: counted(excused),
      frozen,
      through: today,
      from,
    });
    const pastStart = startDay !== undefined && from <= startDay;
    if (!reachesFrom || pastStart || from <= oldest) return streak;

    const older = daysBefore(from, span);
    await readDays(ctx, habit._id, older, previousDay(from), done, excused);
    from = older;
    span *= 2;
    frozen = await frozenDaysBetween(ctx, habit.userId, from, today);
  }
}

/**
 * The streak a run ended with on `through`, counting only the `done` days
 * passed in (the Kept and loss screens count from when the stake was armed).
 * Reads the checks and freezes for the whole run, so an excused day or an old
 * freeze in the middle of it doesn't cut it short.
 */
export async function finishedStreak(
  ctx: Ctx,
  habit: Doc<'habits'>,
  sinceDay: string,
  through: string,
  done: Set<string>,
): Promise<number> {
  const verifications = await ctx.db
    .query('habitVerifications')
    .withIndex('by_habit_and_day', (q) =>
      q.eq('habitId', habit._id).gte('day', sinceDay).lte('day', through),
    )
    .take(MAX_ROWS);
  const frozen = await frozenDaysBetween(ctx, habit.userId, sinceDay, through);

  return runOf({
    target: targetPerWeek(habit),
    startsOn: weekStartsOn(habit),
    done,
    excused: excusedDays(verifications).get(habit._id) ?? new Set<string>(),
    frozen,
    through,
  }).streak;
}

/** Adds the habit's logs and excused days from `from` through `to` to the sets. */
async function readDays(
  ctx: Ctx,
  habitId: Id<'habits'>,
  from: string,
  to: string,
  done: Set<string>,
  excused: Set<string>,
): Promise<void> {
  const completions = await ctx.db
    .query('habitCompletions')
    .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId).gte('day', from).lte('day', to))
    .take(MAX_ROWS);
  for (const completion of completions) done.add(completion.day);

  const verifications = await ctx.db
    .query('habitVerifications')
    .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId).gte('day', from).lte('day', to))
    .take(MAX_ROWS);
  for (const day of excusedDays(verifications).get(habitId) ?? []) excused.add(day);
}
