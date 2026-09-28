import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { authedMutation } from './lib/customFunctions';
import { daysBefore } from './lib/days';
import { isSubscriptionActive } from './lib/entitlements';
import { requireDevOverrides } from './lib/lockout';
import { deliver, eventPush, type PushMessage } from './lib/notify';
import { eventCopy, formatDayLabel, type EventMessage } from './lib/reminderCopy';
import { zonedDay, zonedInstant } from './lib/zonedTime';

/**
 * Pushes about money the user might otherwise forget they're spending: a
 * subscription still renewing while Ante is locked, and a free trial about to
 * turn into a charge. A surprise renewal is what turns into a refund request
 * and a one-star review, so these go out whatever the reminder settings say,
 * like the charge receipt, and always mid-morning in the user's own zone.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How far into a lock the first notice waits: long enough to have been a choice. */
const LOCK_NOTICE_DAYS = 3;
/** Heads-up before a renewal, in days. */
const RENEWAL_LEAD_DAYS = 2;
/** A renewal this close, not yet warned about, is warned about now. */
const RENEWAL_WINDOW_MS = 3 * DAY_MS;
/** After a renewal, how long to give the webhook to move `expiresAt` on. */
const RENEWAL_SETTLE_MS = 6 * HOUR_MS;

/** 10 AM local on `day`: never overnight, however early the event behind it. */
function midMorning(day: string, timeZone: string): number {
  return zonedInstant(day, 10, 0, timeZone);
}

/** Mid-morning, `RENEWAL_LEAD_DAYS` before `at`, but never in the past. */
function headsUpBefore(at: number, timeZone: string, now: number): number {
  const day = daysBefore(zonedDay(at, timeZone), RENEWAL_LEAD_DAYS);
  return Math.max(now + MINUTE_MS, midMorning(day, timeZone));
}

async function subscriptionOf(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'subscriptions'> | null> {
  return await ctx.db
    .query('subscriptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

function notice(
  message: EventMessage,
  fields: { collapseId: string; url: string; expiresAt: number },
): PushMessage {
  return eventPush(eventCopy(message), {
    data: { kind: 'account', url: fields.url },
    collapseId: fields.collapseId,
    threadId: 'account',
    quiet: false,
    expiresAt: fields.expiresAt,
  });
}

/** Starts a lock's notices: the first one goes out mid-morning, three days in. */
export async function scheduleLockNotices(
  ctx: MutationCtx,
  user: Doc<'users'>,
  lockoutId: Id<'lockouts'>,
  lockedAt: number,
): Promise<void> {
  const timeZone = user.timeZone ?? 'UTC';
  const day = daysBefore(zonedDay(lockedAt, timeZone), -LOCK_NOTICE_DAYS);
  await ctx.scheduler.runAt(midMorning(day, timeZone), internal.accountNotices.lockNotice, {
    lockoutId,
    first: true,
  });
}

/**
 * One step of a lock's notices. Tells a locked subscriber, once, that they are
 * still paying; then warns before each renewal for as long as the lock and the
 * renewals go on. Stops for good once the lock lifts, Pro lapses, or it is no
 * longer set to renew: nobody is billed without knowing, which is the point.
 * `noticedExpiry` is the renewal already warned about.
 */
export const lockNotice = internalMutation({
  args: {
    lockoutId: v.id('lockouts'),
    first: v.boolean(),
    noticedExpiry: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const lockout = await ctx.db.get('lockouts', args.lockoutId);
    if (lockout === null || lockout.status !== 'active') return null;

    const now = Date.now();
    const [user, subscription] = await Promise.all([
      ctx.db.get('users', lockout.userId),
      subscriptionOf(ctx, lockout.userId),
    ]);
    if (
      user === null ||
      subscription === null ||
      subscription.expiresAt === undefined ||
      !subscription.willRenew ||
      !isSubscriptionActive(subscription, now)
    ) {
      return null;
    }

    const timeZone = user.timeZone ?? 'UTC';
    const { expiresAt } = subscription;
    // A trial's end has its own notice (`trialNotice`).
    const trial = subscription.status === 'trial';
    let noticed = args.noticedExpiry;

    const renewalDue = !trial && expiresAt - now <= RENEWAL_WINDOW_MS;
    if (noticed !== expiresAt && (args.first || renewalDue)) {
      await deliver(ctx, lockout.userId, [
        notice(
          {
            kind: 'stillLocked',
            renewsLabel: formatDayLabel(expiresAt, now, timeZone),
            renewal: !args.first,
          },
          { collapseId: `lock:${lockout._id}`, url: '/locked', expiresAt: now + DAY_MS },
        ),
      ]);
      // The first notice names the renewal date; it only stands in for the
      // heads-up when that renewal is already close.
      if (renewalDue) noticed = expiresAt;
    }

    const next =
      noticed === expiresAt || trial
        ? expiresAt + RENEWAL_SETTLE_MS
        : headsUpBefore(expiresAt, timeZone, now);
    await ctx.scheduler.runAt(next, internal.accountNotices.lockNotice, {
      lockoutId: lockout._id,
      first: false,
      noticedExpiry: noticed,
    });
    return null;
  },
});

type TrialFields = Pick<Doc<'subscriptions'>, 'status' | 'willRenew' | 'expiresAt'>;

function renewingTrialEnd(subscription: TrialFields | null): number | null {
  if (subscription === null || subscription.status !== 'trial' || !subscription.willRenew) {
    return null;
  }
  return subscription.expiresAt ?? null;
}

/**
 * Called after every write to a subscription row. A trial that is set to
 * renew, and wasn't already (a new trial, or one that was cancelled and then
 * restored), gets a heads-up two days before it becomes a charge.
 */
export async function scheduleTrialNotice(
  ctx: MutationCtx,
  userId: Id<'users'>,
  before: TrialFields | null,
  after: TrialFields,
): Promise<void> {
  const endsAt = renewingTrialEnd(after);
  if (endsAt === null || renewingTrialEnd(before) === endsAt) return;

  const user = await ctx.db.get('users', userId);
  if (user === null) return;
  const runAt = headsUpBefore(endsAt, user.timeZone ?? 'UTC', Date.now());
  await ctx.scheduler.runAt(runAt, internal.accountNotices.trialNotice, {
    userId,
    expiresAt: endsAt,
  });
}

/**
 * The trial's heads-up. Checked again when it goes: a trial cancelled or
 * changed since it was scheduled gets nothing. A cancel-then-restore can
 * schedule it twice; the shared collapse id leaves one notification showing.
 */
export const trialNotice = internalMutation({
  args: { userId: v.id('users'), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now();
    const [user, subscription] = await Promise.all([
      ctx.db.get('users', args.userId),
      subscriptionOf(ctx, args.userId),
    ]);
    if (user === null || renewingTrialEnd(subscription) !== args.expiresAt) return null;
    if (args.expiresAt <= now) return null;

    await deliver(ctx, args.userId, [
      notice(
        {
          kind: 'trialEnding',
          endsLabel: formatDayLabel(args.expiresAt, now, user.timeZone ?? 'UTC'),
        },
        { collapseId: `trial:${args.expiresAt}`, url: '/me', expiresAt: args.expiresAt },
      ),
    ]);
    return null;
  },
});

/**
 * Developer tool: every account notice at once, dated from the real
 * subscription (or a week out), to see them on a device. Dev and preview only.
 */
export const devPreview = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    requireDevOverrides();
    const now = Date.now();
    const subscription = await subscriptionOf(ctx, ctx.user._id);
    const renewsAt =
      subscription?.expiresAt !== undefined && subscription.expiresAt > now
        ? subscription.expiresAt
        : now + 7 * DAY_MS;
    const label = formatDayLabel(renewsAt, now, ctx.user.timeZone ?? 'UTC');
    const fields = (collapseId: string, url: string) => ({
      collapseId,
      url,
      expiresAt: now + HOUR_MS,
    });

    await deliver(ctx, ctx.user._id, [
      notice(
        { kind: 'stillLocked', renewsLabel: label, renewal: false },
        fields('preview:lock', '/locked'),
      ),
      notice(
        { kind: 'stillLocked', renewsLabel: label, renewal: true },
        fields('preview:renewal', '/locked'),
      ),
      notice({ kind: 'trialEnding', endsLabel: label }, fields('preview:trial', '/me')),
    ]);
    return null;
  },
});
