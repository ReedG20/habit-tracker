import { Resend, vOnEmailEventArgs } from '@convex-dev/resend';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { env, internalMutation, type MutationCtx } from './_generated/server';
import { firstName, friendLimiter, normalizeEmail, suppress } from './friends';
import { headsUpEmail, lossEmail, replyToFor, type EmailContent } from './lib/emailCopy';
import { frequencyLabel } from './lib/frequency';
import { notifyFriendTold } from './lib/notify';
import { formatDueLabel } from './lib/reminderCopy';

/**
 * Email to the friends users answer to, through the Resend component, which
 * queues, batches and retries delivery. Sends only leave Convex where
 * `EMAIL_DELIVERY=on` (production); anywhere else they are logged, so a stray
 * dev deployment never emails a real person.
 */

const DEFAULT_FROM = 'Ante <hello@mail.useanteapp.com>';

function resend(): Resend {
  return new Resend(components.resend, {
    apiKey: env.RESEND_API_KEY ?? '',
    webhookSecret: env.RESEND_WEBHOOK_SECRET ?? '',
    testMode: false,
    onEmailEvent: internal.emails.handleEmailEvent,
  });
}

export function resendClient(): Resend {
  return resend();
}

function replyAddress(user: Doc<'users'>): string | undefined {
  return replyToFor(normalizeEmail(user.email));
}

function optOutUrl(friend: Doc<'friends'>): string {
  return `${env.CONVEX_SITE_URL}/email/opt-out?t=${encodeURIComponent(friend.optOutToken)}`;
}

async function isSuppressed(ctx: MutationCtx, email: string): Promise<boolean> {
  const row = await ctx.db
    .query('emailSuppressions')
    .withIndex('by_email', (q) => q.eq('email', email))
    .first();
  return row !== null;
}

async function send(
  ctx: MutationCtx,
  friend: Doc<'friends'>,
  content: EmailContent,
  options: { replyTo?: string; idempotencyKey: string },
): Promise<void> {
  const unsubscribe = optOutUrl(friend);
  if (env.EMAIL_DELIVERY !== 'on') {
    console.log(`[email not sent] to=${friend.email} subject="${content.subject}"\n${content.text}`);
    return;
  }

  await resend().sendEmail(ctx, {
    from: env.EMAIL_FROM ?? DEFAULT_FROM,
    to: friend.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    replyTo: options.replyTo === undefined ? undefined : [options.replyTo],
    headers: [
      // One-click unsubscribe (RFC 8058): mail clients POST to this URL.
      { name: 'List-Unsubscribe', value: `<${unsubscribe}>` },
      { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
    ],
    idempotencyKey: options.idempotencyKey,
  });
}

/** What the stake needs to email its friend, or `null` when they can't be reached. */
async function loadFriendStake(
  ctx: MutationCtx,
  stakeId: Doc<'stakes'>['_id'],
): Promise<{
  stake: Extract<Doc<'stakes'>, { kind: 'friend' }>;
  friend: Doc<'friends'>;
  user: Doc<'users'>;
} | null> {
  const stake = await ctx.db.get('stakes', stakeId);
  if (stake?.kind !== 'friend') return null;
  const [friend, user] = await Promise.all([
    ctx.db.get('friends', stake.friendId),
    ctx.db.get('users', stake.userId),
  ]);
  if (friend === null || user === null || friend.status !== 'active') return null;
  if (await isSuppressed(ctx, friend.email)) return null;
  return { stake, friend, user };
}

/** Tells a newly named friend what they signed up to hear about. */
export const sendHeadsUp = internalMutation({
  args: { stakeId: v.id('stakes') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const loaded = await loadFriendStake(ctx, args.stakeId);
    if (loaded === null || loaded.stake.status !== 'armed') return null;
    const { stake, friend, user } = loaded;

    const limit = await friendLimiter.limit(ctx, 'headsUp', { key: user._id });
    if (!limit.ok) {
      console.warn(`Heads-up email to a friend of ${user._id} skipped: over the daily limit`);
      return null;
    }

    let cadence: string;
    if (stake.habitId !== undefined) {
      const habit = await ctx.db.get('habits', stake.habitId);
      cadence = frequencyLabel(habit?.timesPerWeek ?? 7).toLowerCase();
    } else {
      const goal = stake.goalId === undefined ? null : await ctx.db.get('goals', stake.goalId);
      cadence =
        goal === null
          ? 'once'
          : `by ${formatDueLabel(goal.dueAt, Date.now(), user.timeZone ?? 'UTC')}`;
    }

    const content = headsUpEmail({
      userName: firstName(user.name),
      friendName: friend.name,
      title: stake.title,
      cadence,
      subject: stake.habitId !== undefined ? 'habit' : 'goal',
      optOutUrl: optOutUrl(friend),
    });
    await send(ctx, friend, content, {
      replyTo: replyAddress(user),
      idempotencyKey: `heads-up:${stake._id}`,
    });
    return null;
  },
});

/** The one email a friend gets when the commitment is missed; the user gets a push saying so. */
export const sendLoss = internalMutation({
  args: { stakeId: v.id('stakes') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const loaded = await loadFriendStake(ctx, args.stakeId);
    if (loaded === null || loaded.stake.status !== 'told') return null;
    const { stake, friend, user } = loaded;

    const goal = stake.goalId === undefined ? null : await ctx.db.get('goals', stake.goalId);
    const replyTo = replyAddress(user);
    const content = lossEmail({
      userName: firstName(user.name),
      friendName: friend.name,
      title: stake.title,
      subject: stake.habitId !== undefined ? 'habit' : 'goal',
      streak: stake.run?.streak,
      unit: stake.run?.unit,
      missedPeriod: stake.run?.missedPeriod,
      dueLabel:
        goal === null
          ? undefined
          : formatDueLabel(goal.dueAt, stake.lostAt ?? Date.now(), user.timeZone ?? 'UTC'),
      replyable: replyTo !== undefined,
      optOutUrl: optOutUrl(friend),
    });
    await send(ctx, friend, content, { replyTo, idempotencyKey: `loss:${stake._id}` });
    await notifyFriendTold(ctx, stake);
    return null;
  },
});

/**
 * Resend's delivery reports. A bounce or a spam complaint means the address
 * is never emailed again, and the stakes waiting on it go void.
 */
export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { event } = args;
    if (event.type !== 'email.bounced' && event.type !== 'email.complained') return null;
    // A soft bounce (a full mailbox) is not the address's final word.
    if (event.type === 'email.bounced' && event.data.bounce.type !== 'Permanent') return null;

    const recipients = Array.isArray(event.data.to) ? event.data.to : [event.data.to];
    for (const recipient of recipients) {
      await suppress(ctx, recipient, event.type === 'email.bounced' ? 'bounce' : 'complaint');
    }
    return null;
  },
});
