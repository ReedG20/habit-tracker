import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { comebackStepValidator } from './lib/comebackSchema';
import { comebackAt } from './lib/comebacks';
import { isGoalOpen, isHabitActive } from './lib/commitmentLimits';
import { deliver, eventPush, grantedTokens, reminderSettings } from './lib/notify';
import { COMEBACK_STEPS, eventCopy } from './lib/reminderCopy';
import { zonedDay } from './lib/zonedTime';

/**
 * The pushes once nothing is running: 1, 3 and 7 days after the last
 * commitment ended, mid-morning, then nothing more until another one ends.
 * Without them, someone between commitments never hears from Ante again
 * (deadline reminders stop with the last deadline). Started by
 * `lib/comebacks.ts`; each one checks again before it goes, and stops for
 * good once anything is running, the setting is off, or no device can show it.
 */

const HOUR_MS = 60 * 60 * 1000;
/** Bounds on what one nudge reads; far above what anyone has. */
const MAX_HABITS = 100;
const MAX_GOALS = 200;

export const send = internalMutation({
  args: { userId: v.id('users'), armedAt: v.number(), step: comebackStepValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db
      .query('comebacks')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (row === null || row.armedAt !== args.armedAt || row.step !== args.step) return null;
    const stop = async () => {
      await ctx.db.patch('comebacks', row._id, { jobId: undefined });
      return null;
    };

    const user = await ctx.db.get('users', args.userId);
    if (user === null) return await stop();
    const timeZone = user.timeZone ?? 'UTC';
    const now = Date.now();

    // A habit still going: whatever ends it starts this over.
    const habits = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(MAX_HABITS);
    if (habits.some(isHabitActive)) return await stop();

    // Only goals left: wait for the last deadline, the way its own arming
    // would. A goal proven, lost or deleted before then starts this over.
    const goals = await ctx.db
      .query('goals')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(MAX_GOALS);
    const open = goals.filter((goal) => isGoalOpen(goal, now));
    if (open.length > 0) {
      const last = open.reduce((latest, goal) => (goal.dueAt > latest.dueAt ? goal : latest));
      const anchorDay = zonedDay(last.dueAt, timeZone);
      const jobId = await ctx.scheduler.runAt(
        comebackAt(anchorDay, 1, timeZone),
        internal.comebacks.send,
        { userId: user._id, armedAt: row.armedAt, step: 1 },
      );
      await ctx.db.patch('comebacks', row._id, {
        anchorDay,
        step: 1,
        outcome: 'missed',
        lastTitle: last.title,
        accomplishmentId: undefined,
        jobId,
      });
      return null;
    }

    const settings = await reminderSettings(ctx, user._id);
    if (!settings.comebacks) return await stop();
    const tokens = await grantedTokens(ctx, user._id);
    if (tokens.length === 0) return await stop();

    const goAgain = row.outcome === 'kept' && row.accomplishmentId !== undefined;
    await deliver(
      ctx,
      user._id,
      [
        eventPush(
          eventCopy({
            kind: 'comeback',
            step: args.step,
            outcome: row.outcome,
            lastTitle: row.lastTitle,
          }),
          {
            data: {
              kind: 'comeback',
              url: goAgain ? `/new?from=${row.accomplishmentId}` : '/new',
            },
            collapseId: 'comeback',
            threadId: 'comeback',
            quiet: false,
            expiresAt: now + 24 * HOUR_MS,
          },
        ),
      ],
      tokens,
    );

    const next = COMEBACK_STEPS.find((step) => step > args.step);
    if (next === undefined) return await stop();
    const jobId = await ctx.scheduler.runAt(
      comebackAt(row.anchorDay, next, timeZone),
      internal.comebacks.send,
      { userId: user._id, armedAt: row.armedAt, step: next },
    );
    await ctx.db.patch('comebacks', row._id, { step: next, jobId });
    return null;
  },
});
