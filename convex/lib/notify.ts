import type { Infer } from 'convex/values';

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { outgoingPushValidator } from '../push';
import { eventCopy, type EventMessage, type PushCopy } from './reminderCopy';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from './reminderPresets';
import { nextLocalMidnight, zonedDay } from './zonedTime';

/**
 * The shared plumbing for pushes: whose devices can receive them, how a message
 * is handed to `push.send`, the event pushes other modules raise (a photo
 * verdict, a charge), and `touchReminders`, which re-plans a user's deadline
 * reminders after anything that could move one earlier.
 */

export type OutgoingPush = Infer<typeof outgoingPushValidator>;
export type PushMessage = Omit<OutgoingPush, 'to'>;

export async function reminderSettings(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<ReminderSettings> {
  const row = await ctx.db
    .query('notificationSettings')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  if (row === null) return DEFAULT_REMINDER_SETTINGS;
  return {
    preset: row.preset,
    morningLineup: row.morningLineup,
    breakThroughFocus: row.breakThroughFocus,
    approvals: row.approvals,
  };
}

/** Tokens on devices that will actually show a push. */
export async function grantedTokens(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<string[]> {
  const rows = await ctx.db
    .query('pushTokens')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(20);
  return rows
    .filter((row) => row.permission === 'granted' || row.permission === 'provisional')
    .map((row) => row.token);
}

/** Queues `messages` for every device of the user; one outgoing push per device. */
export async function deliver(
  ctx: MutationCtx,
  userId: Id<'users'>,
  messages: PushMessage[],
  tokens?: string[],
): Promise<void> {
  const to = tokens ?? (await grantedTokens(ctx, userId));
  if (to.length === 0 || messages.length === 0) return;

  const outgoing: OutgoingPush[] = [];
  for (const message of messages) {
    for (const token of to) outgoing.push({ ...message, to: token });
  }
  await ctx.scheduler.runAfter(0, internal.push.send, { messages: outgoing, attempt: 0 });
}

const HOUR_MS = 60 * 60 * 1000;
const seconds = (ms: number) => Math.floor(ms / 1000);

function eventPush(
  copy: PushCopy,
  fields: Pick<PushMessage, 'collapseId' | 'threadId' | 'data'> & {
    quiet: boolean;
    expiresAt: number;
  },
): PushMessage {
  return {
    ...copy,
    data: fields.data,
    collapseId: fields.collapseId,
    threadId: fields.threadId,
    interruptionLevel: fields.quiet ? 'passive' : 'active',
    sound: fields.quiet ? undefined : 'default',
    expiration: seconds(fields.expiresAt),
    relevanceScore: fields.quiet ? 0.2 : 0.8,
  };
}

/**
 * The verdict on a habit photo. A rejection comes through whenever there's
 * still time to retry that day: that is exactly the moment someone who closed
 * the app would otherwise miss. An approval is a quiet note, if they want it.
 * A check that failed on our side excuses the day, so it needs no push.
 */
export async function notifyHabitVerdict(
  ctx: MutationCtx,
  verification: Doc<'habitVerifications'>,
  status: 'approved' | 'rejected' | 'failed',
  reason: string,
): Promise<void> {
  if (status === 'failed') return;
  const [user, habit] = await Promise.all([
    ctx.db.get('users', verification.userId),
    ctx.db.get('habits', verification.habitId),
  ]);
  if (user === null || habit === null) return;

  const now = Date.now();
  const data = { kind: 'proof', url: `/habit/${habit._id}` };

  if (status === 'approved') {
    const settings = await reminderSettings(ctx, user._id);
    if (!settings.approvals) return;
    const message: EventMessage = {
      kind: 'approved',
      subject: 'habit',
      title: habit.title,
      stakeCents: null,
    };
    await deliver(ctx, user._id, [
      eventPush(eventCopy(message), {
        data,
        collapseId: `proof:${habit._id}:${verification.day}`,
        threadId: 'proof',
        quiet: true,
        expiresAt: now + 12 * HOUR_MS,
      }),
    ]);
    return;
  }

  // Only while the photo's day is still running: after midnight it's settled.
  if (user.timeZone === undefined || zonedDay(now, user.timeZone) !== verification.day) return;
  const midnight = nextLocalMidnight(now, user.timeZone);
  const message: EventMessage = {
    kind: 'rejected',
    subject: 'habit',
    title: habit.title,
    reason,
    msLeft: midnight - now,
  };
  await deliver(ctx, user._id, [
    eventPush(eventCopy(message), {
      data,
      collapseId: `proof:${habit._id}:${verification.day}`,
      threadId: 'proof',
      quiet: false,
      expiresAt: midnight,
    }),
  ]);
}

/**
 * The verdict on goal proof. Replaces the goal's reminder in Notification
 * Center (same collapse id), so the latest word on a deadline is the only one.
 * A check that failed on our side is worth a push too: they need to resend.
 */
export async function notifyGoalVerdict(
  ctx: MutationCtx,
  goal: Doc<'goals'>,
  status: 'approved' | 'rejected' | 'failed',
  reason: string,
): Promise<void> {
  const now = Date.now();
  const data = { kind: 'proof', url: `/goals/${goal._id}` };
  const collapseId = `goals:${goal.dueAt}`;

  if (status === 'approved') {
    const settings = await reminderSettings(ctx, goal.userId);
    if (!settings.approvals) return;
    const message: EventMessage = {
      kind: 'approved',
      subject: 'goal',
      title: goal.title,
      stakeCents: goal.stake?.amountCents ?? null,
    };
    await deliver(ctx, goal.userId, [
      eventPush(eventCopy(message), {
        data,
        collapseId,
        threadId: 'proof',
        quiet: true,
        expiresAt: now + 12 * HOUR_MS,
      }),
    ]);
    return;
  }

  // Past the deadline, a verdict can't change anything: no push after a loss.
  if (goal.completedAt !== undefined || goal.dueAt <= now) return;
  const message: EventMessage =
    status === 'rejected'
      ? { kind: 'rejected', subject: 'goal', title: goal.title, reason, msLeft: goal.dueAt - now }
      : { kind: 'unchecked', title: goal.title, msLeft: goal.dueAt - now };
  await deliver(ctx, goal.userId, [
    eventPush(eventCopy(message), {
      data,
      collapseId,
      threadId: 'proof',
      quiet: false,
      expiresAt: goal.dueAt,
    }),
  ]);
}

/**
 * A receipt when a stake is charged. Always sent, and quiet: money leaving a
 * card should never be a surprise, and a surprise is what turns into a dispute.
 */
export async function notifyCharged(ctx: MutationCtx, goal: Doc<'goals'>): Promise<void> {
  if (goal.stake === undefined) return;
  const message: EventMessage = {
    kind: 'charged',
    title: goal.title,
    amountCents: goal.stake.amountCents,
  };
  await deliver(ctx, goal.userId, [
    eventPush(eventCopy(message), {
      data: { kind: 'receipt', url: `/goals/${goal._id}` },
      collapseId: `goals:${goal.dueAt}`,
      threadId: 'receipt',
      quiet: true,
      expiresAt: Date.now() + 72 * HOUR_MS,
    }),
  ]);
}

/**
 * Re-plans the user's reminders from scratch, now. Call it after anything that
 * could make a reminder due earlier than planned: a new commitment, an earlier
 * deadline, a zone change, new settings, a device that can now receive pushes.
 * Things that only remove reminders (finishing, deleting, a lock) need no
 * touch: each run re-reads what's still owed before it sends.
 *
 * Bumping `generation` retires any run already scheduled or in flight.
 */
export async function touchReminders(ctx: MutationCtx, userId: Id<'users'>): Promise<void> {
  const state = await ctx.db
    .query('reminderState')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();

  if (state?.jobId !== undefined) {
    try {
      await ctx.scheduler.cancel(state.jobId);
    } catch {
      // Already ran; the generation bump retires it anyway.
    }
  }

  const generation = (state?.generation ?? 0) + 1;
  // Nobody to tell: stay idle until a device registers, which touches again.
  const jobId =
    (await grantedTokens(ctx, userId)).length === 0
      ? undefined
      : await ctx.scheduler.runAfter(0, internal.reminders.runUser, { userId, generation });

  if (state === null) {
    // Starting now, so a first run never sends nudges from earlier today.
    await ctx.db.insert('reminderState', {
      userId,
      generation,
      jobId,
      sentThrough: Date.now(),
      sentToday: 0,
    });
  } else {
    await ctx.db.patch('reminderState', state._id, { generation, jobId });
  }
}
