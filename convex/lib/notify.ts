import type { Infer } from 'convex/values';

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { outgoingPushValidator } from '../push';
import { eventCopy, type EventMessage, type PushCopy } from './reminderCopy';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from './reminderPresets';
import { cardOnFile } from './supportCopy';
import { habitDay, nextDayEnd } from './zonedTime';

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

export function eventPush(
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
 * The verdict on habit proof. A rejection comes through whenever there's
 * still time to retry that day: that is exactly the moment someone who closed
 * the app would otherwise miss. An approval is a quiet note, if they want it.
 * A check that failed on our side excuses the day, so it needs no push. A
 * timer settles while the app is open, and the app raises its own local
 * notification the moment a run is cut short, so timers need none either.
 */
export async function notifyHabitVerdict(
  ctx: MutationCtx,
  verification: Doc<'habitVerifications'>,
  status: 'approved' | 'rejected' | 'failed',
  reason: string,
): Promise<void> {
  if (status === 'failed' || verification.method === 'timer') return;
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

  // Only while the proof's day is still running: once it ends it's settled.
  if (user.timeZone === undefined || habitDay(now, user.timeZone) !== verification.day) return;
  const dayEnd = nextDayEnd(now, user.timeZone);
  const message: EventMessage = {
    kind: 'rejected',
    subject: 'habit',
    title: habit.title,
    reason,
    method: verification.method,
    msLeft: dayEnd - now,
  };
  await deliver(ctx, user._id, [
    eventPush(eventCopy(message), {
      data,
      collapseId: `proof:${habit._id}:${verification.day}`,
      threadId: 'proof',
      quiet: false,
      expiresAt: dayEnd,
    }),
  ]);
}

/** The money on a goal, wherever it is stored. */
async function goalStakeCents(ctx: MutationCtx, goal: Doc<'goals'>): Promise<number | null> {
  if (goal.stakeId !== undefined) {
    const stake = await ctx.db.get('stakes', goal.stakeId);
    return stake?.kind === 'money' ? stake.amountCents : null;
  }
  return goal.stake?.amountCents ?? null;
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
      stakeCents: await goalStakeCents(ctx, goal),
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

/** Where a push about a stake takes old builds (`url`) and new ones (`lossStakeId`). */
function stakeLink(stake: Doc<'stakes'>): { url: string; lossStakeId: string } {
  const url =
    stake.goalId !== undefined
      ? `/goals/${stake.goalId}`
      : stake.habitId !== undefined
        ? `/habit/${stake.habitId}`
        : '/';
  return { url, lossStakeId: stake._id };
}

/** One lock-screen slot per stake, so a later word on it replaces the earlier one. */
function stakeCollapseId(stake: Doc<'stakes'>): string {
  return `stake:${stake._id}`;
}

/**
 * A receipt when a stake is charged. Always sent, and quiet: money leaving a
 * card should never be a surprise, and a surprise is what turns into a dispute.
 */
export async function notifyCharged(ctx: MutationCtx, stake: Doc<'stakes'>): Promise<void> {
  if (stake.kind !== 'money') return;
  const message: EventMessage = {
    kind: 'charged',
    subject: stake.habitId !== undefined ? 'habit' : 'goal',
    title: stake.title,
    amountCents: stake.amountCents,
    streak: stake.run?.streak,
  };
  await deliver(ctx, stake.userId, [
    eventPush(eventCopy(message), {
      data: { kind: 'receipt', ...stakeLink(stake) },
      collapseId: stakeCollapseId(stake),
      threadId: 'receipt',
      quiet: true,
      expiresAt: Date.now() + 72 * HOUR_MS,
    }),
  ]);
}

/** The card said no: they still owe it, and can settle up from the loss screen. */
export async function notifyDeclined(ctx: MutationCtx, stake: Doc<'stakes'>): Promise<void> {
  if (stake.kind !== 'money') return;
  const message: EventMessage = {
    kind: 'declined',
    title: stake.title,
    amountCents: stake.amountCents,
  };
  await deliver(ctx, stake.userId, [
    eventPush(eventCopy(message), {
      data: { kind: 'receipt', ...stakeLink(stake) },
      collapseId: stakeCollapseId(stake),
      threadId: 'receipt',
      quiet: false,
      expiresAt: Date.now() + 72 * HOUR_MS,
    }),
  ]);
}

/** Money came back: a refund from support, or the automatic one on a fraud warning. */
export async function notifyRefunded(ctx: MutationCtx, stake: Doc<'stakes'>): Promise<void> {
  if (stake.kind !== 'money') return;
  const message: EventMessage = {
    kind: 'refunded',
    title: stake.title,
    amountCents: stake.amountCents,
    card: cardOnFile(stake),
  };
  await deliver(ctx, stake.userId, [
    eventPush(eventCopy(message), {
      data: { kind: 'receipt', ...stakeLink(stake) },
      collapseId: stakeCollapseId(stake),
      threadId: 'receipt',
      quiet: false,
      expiresAt: Date.now() + 72 * HOUR_MS,
    }),
  ]);
}

/** Support looked at a contested charge and is keeping it; `response` says why. */
export async function notifyContestDeclined(
  ctx: MutationCtx,
  stake: Doc<'stakes'>,
  response: string,
): Promise<void> {
  const message: EventMessage = { kind: 'contestDeclined', title: stake.title, response };
  await deliver(ctx, stake.userId, [
    eventPush(eventCopy(message), {
      data: { kind: 'receipt', ...stakeLink(stake) },
      collapseId: stakeCollapseId(stake),
      threadId: 'receipt',
      quiet: false,
      expiresAt: Date.now() + 7 * 24 * HOUR_MS,
    }),
  ]);
}

/** Their friend was just emailed about the miss. */
export async function notifyFriendTold(ctx: MutationCtx, stake: Doc<'stakes'>): Promise<void> {
  if (stake.kind !== 'friend') return;
  const message: EventMessage = {
    kind: 'friendTold',
    title: stake.title,
    friendName: stake.friendName,
  };
  await deliver(ctx, stake.userId, [
    eventPush(eventCopy(message), {
      data: { kind: 'receipt', ...stakeLink(stake) },
      collapseId: stakeCollapseId(stake),
      threadId: 'receipt',
      quiet: false,
      expiresAt: Date.now() + 72 * HOUR_MS,
    }),
  ]);
}

/** A lockout stake came due: every habit is frozen until `untilLabel`. */
export async function notifyFrozen(
  ctx: MutationCtx,
  stake: Doc<'stakes'>,
  untilLabel: string,
): Promise<void> {
  const message: EventMessage = { kind: 'frozen', title: stake.title, untilLabel };
  await deliver(ctx, stake.userId, [
    eventPush(eventCopy(message), {
      data: { kind: 'receipt', ...stakeLink(stake) },
      collapseId: 'freeze',
      threadId: 'receipt',
      quiet: false,
      expiresAt: Date.now() + 72 * HOUR_MS,
    }),
  ]);
}

/** The freeze lifted: habits count again from tomorrow. */
export async function notifyThawed(ctx: MutationCtx, userId: Id<'users'>): Promise<void> {
  await deliver(ctx, userId, [
    eventPush(eventCopy({ kind: 'thawed' }), {
      data: { kind: 'receipt', url: '/' },
      collapseId: 'freeze',
      threadId: 'receipt',
      quiet: true,
      expiresAt: Date.now() + 24 * HOUR_MS,
    }),
  ]);
}

/** Their friend won't hear about misses any more; the stake is void until they pick someone. */
export async function notifyFriendGone(
  ctx: MutationCtx,
  stake: Doc<'stakes'>,
  why: 'opted_out' | 'bounced',
): Promise<void> {
  if (stake.kind !== 'friend') return;
  const message: EventMessage = {
    kind: 'friendGone',
    title: stake.title,
    friendName: stake.friendName,
    why,
  };
  const url =
    stake.habitId !== undefined ? `/habit/${stake.habitId}` : `/goals/${stake.goalId ?? ''}`;
  await deliver(ctx, stake.userId, [
    eventPush(eventCopy(message), {
      data: { kind: 'receipt', url },
      collapseId: stakeCollapseId(stake),
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
