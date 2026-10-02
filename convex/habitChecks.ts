import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { recordKeptHabit } from './accomplishments';
import { frozenDaysBetween, startOrExtendFreeze } from './freezes';
import { deleteHabit } from './habits';
import {
  daysBefore,
  nextDay,
  previousDay,
  streakLength,
  STREAK_WINDOW_DAYS,
  weeklyStreak,
} from './lib/days';
import { DAILY, targetPerWeek } from './lib/frequency';
import { graceAvailable, grantWaivers, wasWaived } from './lib/grace';
import { weekStartsOn } from './lib/habitWeek';
import { findMisses, localDay, type Miss } from './lib/lockout';
import { loseStake, type Run } from './lib/stakes';
import { isSubscriptionActive } from './lib/entitlements';

/**
 * The nightly reckoning for habits, run for each user by the hourly
 * `lockouts.checkAll` once their local day has ended. Each missed habit gets
 * its own stake's consequence: money is charged, a friend is emailed, a
 * lockout freezes every habit. Any of those breaks the habit, so it stops
 * being judged until the user restarts it. A habit on the user's word just
 * loses its streak.
 *
 * Everything is applied in the transaction that advances `lastCheckedDay`, so
 * a day can never be judged twice.
 */

/** Longest a stake's run is read back for the loss screen: a few years of days. */
const MAX_RUN_DAYS = 2000;

/**
 * Checks every day from the user's last check through their local yesterday,
 * so a skipped cron run is caught up by the next one. Waits while a photo from
 * that span is still being judged, so a photo taken at 11:59 PM gets its
 * verdict first.
 *
 * Only Pro is held to its habits. Without it they pause: the days that ended
 * while Pro was still active are judged, and nothing after. While paused the
 * cursor keeps moving, so resubscribing makes that day free.
 */
export async function checkUser(ctx: MutationCtx, user: Doc<'users'>, now: number): Promise<void> {
  const { timeZone, lastCheckedDay, accountableFrom } = user;
  if (timeZone === undefined || lastCheckedDay === undefined || accountableFrom === undefined) {
    return;
  }

  const today = localDay(now, timeZone);
  const yesterday = previousDay(today);
  if (lastCheckedDay >= yesterday) return;

  const pausedFrom = await pausedFromDay(ctx, user._id, timeZone, now);
  const paused = pausedFrom !== null;
  // Judged through yesterday, or, once Pro has ended, the last day it covered.
  let to = yesterday;
  if (pausedFrom === 'always') to = lastCheckedDay;
  else if (pausedFrom !== null && pausedFrom <= yesterday) to = previousDay(pausedFrom);

  const oldest = daysBefore(to, STREAK_WINDOW_DAYS);
  const next = nextDay(lastCheckedDay);
  const from = next < oldest ? oldest : next;
  // A weekly habit is judged on its week's last day, over logs from six days before.
  const readFrom = daysBefore(from, 6);

  const verifications = await ctx.db
    .query('habitVerifications')
    .withIndex('by_user_and_day', (q) =>
      q.eq('userId', user._id).gte('day', readFrom).lte('day', to),
    )
    .collect();
  if (verifications.some((verification) => verification.status === 'pending')) return;

  const habits = await ctx.db
    .query('habits')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .collect();

  const completions = await ctx.db
    .query('habitCompletions')
    .withIndex('by_user_and_day', (q) =>
      q.eq('userId', user._id).gte('day', readFrom).lte('day', to),
    )
    .collect();

  const completedDays = new Map<Id<'habits'>, Set<string>>();
  for (const completion of completions) {
    const days = completedDays.get(completion.habitId) ?? new Set<string>();
    days.add(completion.day);
    completedDays.set(completion.habitId, days);
  }

  // A day whose latest photo check `failed` is excused: that was our error.
  const latest = new Map<string, Doc<'habitVerifications'>>();
  for (const verification of verifications) {
    const key = `${verification.habitId}|${verification.day}`;
    const seen = latest.get(key);
    if (seen === undefined || verification.createdAt > seen.createdAt) {
      latest.set(key, verification);
    }
  }
  const excusedDays = new Map<Id<'habits'>, Set<string>>();
  for (const verification of latest.values()) {
    if (verification.status !== 'failed') continue;
    const days = excusedDays.get(verification.habitId) ?? new Set<string>();
    days.add(verification.day);
    excusedDays.set(verification.habitId, days);
  }

  const frozenDays = await frozenDaysBetween(ctx, user._id, readFrom, to);
  const misses = findMisses({
    habits,
    completedDays,
    excusedDays,
    frozenDays,
    accountableFrom,
    from,
    to,
  });

  await ctx.db.patch(
    'users',
    user._id,
    paused
      ? { lastCheckedDay: yesterday, accountableFrom: nextDay(today) }
      : { lastCheckedDay: to },
  );

  const byId = new Map(habits.map((habit) => [habit._id, habit]));
  const staked: { habit: Doc<'habits'>; stake: Doc<'stakes'>; miss: Miss }[] = [];
  for (const miss of misses) {
    const habit = byId.get(miss.habitId);
    if (habit?.stakeId === undefined) continue;
    const stake = await ctx.db.get('stakes', habit.stakeId);
    // No stake, or one that's void or already spent: the streak just resets.
    if (stake === null || stake.status !== 'armed') continue;
    staked.push({ habit, stake, miss });
  }

  // A first miss with something on the line is let go, once (`lib/grace.ts`):
  // all of today's together, so none of them is charged beside a waived one.
  const ticket =
    staked.length === 0
      ? null
      : await graceAvailable(
          ctx,
          user,
          staked.map(({ stake }) => stake),
        );
  if (ticket !== null) {
    await grantWaivers(
      ctx,
      user,
      staked.map(({ habit, stake, miss }) => ({ habit, stake, period: miss.period })),
      ticket,
      now,
    );
  }

  const lockouts: Extract<Doc<'stakes'>, { kind: 'lockout' }>[] = [];
  const broke = new Set<Id<'habits'>>();
  for (const { habit, stake, miss } of ticket === null ? staked : []) {
    const run = await runSnapshot(ctx, habit, stake, miss, frozenDays, timeZone);
    if (!(await loseStake(ctx, stake, now, run))) continue;
    await ctx.db.patch('habits', habit._id, { brokenAt: now });
    broke.add(habit._id);
    if (stake.kind === 'lockout') lockouts.push({ ...stake, status: 'triggered' });
  }
  await startOrExtendFreeze(ctx, user, lockouts, now);

  // An ending habit stays until its last day has been checked. One that broke
  // during its notice goes now: its stake is spent, so nothing is left to see through.
  // One that made it to the end clean is kept: the Kept screen marks it.
  for (const habit of habits) {
    if (habit.endsAfter === undefined) continue;
    if (broke.has(habit._id)) {
      await deleteHabit(ctx, habit._id);
    } else if (habit.endsAfter <= yesterday) {
      // One whose miss was let go didn't make it clean: it ends without the Kept screen.
      if (!(await wasWaived(ctx, habit))) {
        await recordKeptHabit(ctx, habit, timeZone, frozenDays, now);
      }
      await deleteHabit(ctx, habit._id);
    }
  }
}

/**
 * How the stake's run ended, for the loss screen and the friend's email: the
 * streak it held up to the miss (counting only days since it was armed), and
 * how many photos went in while it was on.
 */
async function runSnapshot(
  ctx: MutationCtx,
  habit: Doc<'habits'>,
  stake: Doc<'stakes'>,
  miss: Miss,
  frozenDays: Set<string>,
  timeZone: string,
): Promise<Run> {
  const sinceDay = localDay(stake.createdAt, timeZone);
  // A weekly miss's period is the first day of the week that came up short.
  const periodEnd = daysBefore(miss.period, -6);
  const rows = await ctx.db
    .query('habitCompletions')
    .withIndex('by_habit_and_day', (q) =>
      q.eq('habitId', habit._id).gte('day', sinceDay).lte('day', periodEnd),
    )
    .take(MAX_RUN_DAYS);
  const done = new Set(rows.map((row) => row.day));

  const target = targetPerWeek(habit);
  const daily = target >= DAILY;
  const streak = daily
    ? streakLength(
        new Set([...done].filter((day) => day < miss.period)),
        previousDay(miss.period),
        frozenDays,
      )
    : weeklyStreak(
        new Set([...done].filter((day) => day < miss.period)),
        previousDay(miss.period),
        target,
        weekStartsOn(habit),
        frozenDays,
      );

  return {
    streak,
    unit: daily ? 'day' : 'week',
    completions: rows.filter((row) => row.day <= (daily ? miss.period : periodEnd)).length,
    sinceDay,
    missedPeriod: miss.period,
  };
}

/**
 * The user's local day their habits paused on (the day Pro ended), or `null`
 * while Pro is active. `'always'` when there is no end date to go by: they
 * never had Pro, or an open-ended grant was revoked, so nothing is judged.
 */
export async function pausedFromDay(
  ctx: MutationCtx,
  userId: Id<'users'>,
  timeZone: string,
  now: number,
): Promise<string | 'always' | null> {
  const subscription = await ctx.db
    .query('subscriptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  if (subscription !== null && isSubscriptionActive(subscription, now)) return null;
  if (subscription?.expiresAt === undefined) return 'always';
  return localDay(subscription.expiresAt, timeZone);
}
