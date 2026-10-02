import type { Infer } from 'convex/values';

import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { comebackOutcomeValidator, comebackStepValidator } from './comebackSchema';
import { daysBefore } from './days';
import { zonedDay, zonedInstant } from './zonedTime';

/**
 * Starting over a user's comeback nudges (`comebacks.ts`) whenever one of
 * their commitments ends, or could end without anything else noticing (a goal
 * on just their word passing its deadline). Each nudge checks again before it
 * goes, so arming one for someone with plenty still running costs nothing.
 */

export type ComebackOutcome = Infer<typeof comebackOutcomeValidator>;
type ComebackStep = Infer<typeof comebackStepValidator>;

/** Local wall-clock time the nudges go out. */
export const COMEBACK_TIME = { hour: 10, minute: 0 };

/** When the nudge `step` days after `anchorDay` goes out, in the user's zone. */
export function comebackAt(anchorDay: string, step: ComebackStep, timeZone: string): number {
  return zonedInstant(
    daysBefore(anchorDay, -step),
    COMEBACK_TIME.hour,
    COMEBACK_TIME.minute,
    timeZone,
  );
}

/**
 * Starts the sequence again from `endedAt`, replacing whatever was pending.
 * `endedAt` may be in the future: a goal's deadline, armed when it's made.
 */
export async function armComeback(
  ctx: MutationCtx,
  userId: Id<'users'>,
  last: {
    endedAt: number;
    outcome: ComebackOutcome;
    title?: string;
    accomplishmentId?: Id<'accomplishments'>;
  },
): Promise<void> {
  const user = await ctx.db.get('users', userId);
  if (user === null) return;
  const timeZone = user.timeZone ?? 'UTC';

  const row = await ctx.db
    .query('comebacks')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  if (row?.jobId !== undefined) {
    try {
      await ctx.scheduler.cancel(row.jobId);
    } catch {
      // Already ran; `armedAt` retires it anyway.
    }
  }

  const now = Date.now();
  const anchorDay = zonedDay(last.endedAt, timeZone);
  const armedAt = row !== null && row.armedAt >= now ? row.armedAt + 1 : now;
  const jobId = await ctx.scheduler.runAt(
    Math.max(now, comebackAt(anchorDay, 1, timeZone)),
    internal.comebacks.send,
    { userId, armedAt, step: 1 },
  );
  const fields = {
    anchorDay,
    step: 1 as const,
    outcome: last.outcome,
    lastTitle: last.title,
    accomplishmentId: last.accomplishmentId,
    armedAt,
    jobId,
  };
  if (row === null) {
    await ctx.db.insert('comebacks', { userId, ...fields });
  } else {
    await ctx.db.replace('comebacks', row._id, { userId, ...fields });
  }
}
