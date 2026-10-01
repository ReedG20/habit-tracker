import { HOUR, RateLimiter } from '@convex-dev/rate-limiter';
import { ConvexError, v } from 'convex/values';

import { components } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import type { AuthedCtx } from './habits';
import { authedMutation } from './lib/customFunctions';
import { logCompletion, requireCanProve } from './lib/proof';
import { nextDayEnd } from './lib/zonedTime';

/**
 * Timer proof: the habit counts once a timer of its length runs out with Ante
 * open the whole time. The app watches for leaving (backgrounding, locking)
 * and reports it through `abandon`; the server's part is the clock, so a run
 * can't be finished before its time is up.
 *
 * A run is not a pending check (that would hold the nightly check and show
 * "verifying"). It writes a verification row only when it ends: approved when
 * it ran out, rejected when it was cut short. A rejection is just a failed
 * attempt; the day stays open and a new run can start right away.
 */

/** Covers the round trip between the app's countdown and the server's clock. */
const FINISH_TOLERANCE_MS = 1500;

/**
 * How long after a run ends it can still be finished. The app finishes a run
 * the moment it runs out (retrying through a flaky connection); a run finished
 * much later was left, with the app suspended, and never counts.
 */
const FINISH_GRACE_MS = 5 * 60 * 1000;

/** A run has to end at least this long before the day does, so finishing it never crosses into tomorrow. */
const DAY_END_MARGIN_MS = 2 * 60 * 1000;

/** Each cut-short run leaves a rejected check behind, so starting is bounded. */
const rateLimiter = new RateLimiter(components.rateLimiter, {
  timerStart: { kind: 'token bucket', rate: 30, period: HOUR, capacity: 15 },
});

const MINUTE_MS = 60 * 1000;

const runValidator = v.object({
  runId: v.id('habitTimerRuns'),
  startedAt: v.number(),
  durationMs: v.number(),
});

export const start = authedMutation({
  args: { habitId: v.id('habits'), day: v.string() },
  returns: runValidator,
  handler: async (ctx, args) => {
    const { habit, day } = await requireCanProve(ctx, args.habitId, args.day, 'timer');
    if (habit.timerMinutes === undefined) {
      throw new ConvexError('This habit has no timer length');
    }
    const durationMs = habit.timerMinutes * MINUTE_MS;
    const now = Date.now();

    // A run never straddles the end of the day, so the nightly check never has to wait on one.
    if (
      ctx.user.timeZone !== undefined &&
      now + durationMs + DAY_END_MARGIN_MS > nextDayEnd(now, ctx.user.timeZone)
    ) {
      throw new ConvexError(
        `There isn’t enough of today left for a ${habit.timerMinutes}-minute timer.`,
      );
    }

    const limit = await rateLimiter.limit(ctx, 'timerStart', { key: ctx.user._id });
    if (!limit.ok) {
      throw new ConvexError('That’s a lot of restarts. Give it a few minutes and try again.');
    }

    // A run the app never got to end (killed, lost signal) is simply dropped.
    const stale = await ctx.db
      .query('habitTimerRuns')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', habit._id).eq('day', day))
      .order('desc')
      .take(10);
    for (const run of stale) {
      if (run.status === 'running') {
        await ctx.db.patch('habitTimerRuns', run._id, { status: 'abandoned', endedAt: now });
      }
    }

    const runId = await ctx.db.insert('habitTimerRuns', {
      userId: ctx.user._id,
      habitId: habit._id,
      day,
      startedAt: now,
      durationMs,
      status: 'running',
    });
    return { runId, startedAt: now, durationMs };
  },
});

/** `logged: false` when the run ended long ago without the app finishing it: it was left. */
export const finish = authedMutation({
  args: { runId: v.id('habitTimerRuns') },
  returns: v.object({ logged: v.boolean() }),
  handler: async (ctx, args): Promise<{ logged: boolean }> => {
    const run = await requireOwnedRun(ctx, args.runId);
    if (run.status !== 'running') {
      throw new ConvexError('This timer already ended. Start a new one.');
    }
    const now = Date.now();
    const endsAt = run.startedAt + run.durationMs;
    if (now < endsAt - FINISH_TOLERANCE_MS) {
      throw new ConvexError('The timer isn’t done yet.');
    }
    if (now > endsAt + FINISH_GRACE_MS) {
      // Returned rather than thrown, so the drop sticks.
      await ctx.db.patch('habitTimerRuns', run._id, { status: 'abandoned', endedAt: now });
      return { logged: false };
    }
    // Still provable: not logged some other way, not broken or frozen meanwhile,
    // and still the day it started, which the nightly check hasn't judged.
    const { day } = await requireCanProve(ctx, run.habitId, run.day, 'timer');
    if (day !== run.day) {
      throw new ConvexError('That timer ran into the next day. Start a new one.');
    }

    await ctx.db.patch('habitTimerRuns', run._id, { status: 'completed', endedAt: now });
    await ctx.db.insert('habitVerifications', {
      userId: run.userId,
      habitId: run.habitId,
      day: run.day,
      method: 'timer',
      status: 'approved',
      reason: `You stayed with it for ${minutesLabel(run.durationMs)}.`,
      createdAt: now,
      resolvedAt: now,
    });
    await logCompletion(ctx, run);
    return { logged: true };
  },
});

/**
 * The run was cut short: the app left the foreground (`left`) or the user
 * ended it (`stopped`). Idempotent, since the app retries a report it may have
 * sent just before it was suspended.
 */
export const abandon = authedMutation({
  args: { runId: v.id('habitTimerRuns'), reason: v.union(v.literal('left'), v.literal('stopped')) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const run = await requireOwnedRun(ctx, args.runId);
    if (run.status !== 'running') return null;

    const now = Date.now();
    await ctx.db.patch('habitTimerRuns', run._id, { status: 'abandoned', endedAt: now });

    const completion = await ctx.db
      .query('habitCompletions')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', run.habitId).eq('day', run.day))
      .unique();
    if (completion !== null) return null;

    await ctx.db.insert('habitVerifications', {
      userId: run.userId,
      habitId: run.habitId,
      day: run.day,
      method: 'timer',
      status: 'rejected',
      reason: abandonReason(args.reason, Math.min(now - run.startedAt, run.durationMs)),
      createdAt: now,
      resolvedAt: now,
    });
    return null;
  },
});

async function requireOwnedRun(
  ctx: AuthedCtx<MutationCtx>,
  runId: Id<'habitTimerRuns'>,
): Promise<Doc<'habitTimerRuns'>> {
  const run = await ctx.db.get('habitTimerRuns', runId);
  if (run === null || run.userId !== ctx.user._id) {
    throw new ConvexError('Timer not found');
  }
  return run;
}

function minutesLabel(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

export function abandonReason(reason: 'left' | 'stopped', elapsedMs: number): string {
  const when = elapsedMs < MINUTE_MS ? 'in the first minute' : `${minutesLabel(elapsedMs)} in`;
  const what = reason === 'left' ? 'You left Ante' : 'You ended the timer';
  return `${what} ${when}, so it didn’t count. Start again whenever you’re ready.`;
}
