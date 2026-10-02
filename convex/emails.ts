import { Resend, vOnEmailEventArgs } from '@convex-dev/resend';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { env, internalMutation, type MutationCtx } from './_generated/server';
import { contractAsOf } from './contracts';
import { firstName, normalizeEmail, suppress } from './friends';
import {
  deliverableEmail,
  headsUpEmail,
  lossEmail,
  replyToFor,
  type EmailContent,
} from './lib/emailCopy';
import { endDayLabel } from './lib/endDate';
import { inviteCode, inviteUrl } from './lib/invite';
import { DAILY, frequencyLabel, targetPerWeek } from './lib/frequency';
import { graceEmail, graceStakeLine, type GraceStake } from './lib/graceCopy';
import { notifyFriendTold } from './lib/notify';
import { formatDueLabel } from './lib/reminderCopy';
import { cardOnFile, supportCaseEmail, type SupportProof } from './lib/supportCopy';

/**
 * Email to the friends users answer to (and, once, to the user: the one-time
 * reprieve, `sendGrace`), through the Resend component, which
 * queues, batches and retries delivery. Sends only leave Convex where
 * `EMAIL_DELIVERY=on` (production); anywhere else they are logged, so a stray
 * dev deployment never emails a real person.
 */

const DEFAULT_FROM = 'Ante <hello@mail.useanteapp.com>';
const DEFAULT_SUPPORT_EMAIL = 'support@useanteapp.com';
/** How much proof a support email shows. */
const SUPPORT_PROOFS = 6;

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
    console.log(
      `[email not sent] to=${friend.email} subject="${content.subject}"\n${content.text}`,
    );
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
    // The daily limit was taken when the stake was armed (`stakes.armStake`).
    const { stake, friend, user } = loaded;

    let cadence: string;
    if (stake.habitId !== undefined) {
      const habit = await ctx.db.get('habits', stake.habitId);
      cadence = frequencyLabel(habit?.timesPerWeek ?? 7).toLowerCase();
      if (habit?.endsOn !== undefined) cadence += `, through ${endDayLabel(habit.endsOn)}`;
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
      inviteUrl: inviteUrl('heads_up', inviteCode(user._id)),
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
          : // The deadline they were told about, even if it was moved once since.
            formatDueLabel(
              goal.originalDueAt ?? goal.dueAt,
              stake.lostAt ?? Date.now(),
              user.timeZone ?? 'UTC',
            ),
      replyable: replyTo !== undefined,
      optOutUrl: optOutUrl(friend),
      inviteUrl: inviteUrl('loss', inviteCode(user._id)),
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

/**
 * Tells support about a money charge that needs a person: a user contesting
 * it in the app (`reviewId`), a chargeback, or an early fraud warning. Goes
 * to `SUPPORT_EMAIL`, with Reply-To on the user when it can reach them.
 */
export const sendSupportCase = internalMutation({
  args: {
    stakeId: v.id('stakes'),
    kind: v.union(v.literal('contest'), v.literal('dispute'), v.literal('fraud_warning')),
    reviewId: v.optional(v.id('chargeReviews')),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const stake = await ctx.db.get('stakes', args.stakeId);
    if (stake?.kind !== 'money') return null;
    const [user, review] = await Promise.all([
      ctx.db.get('users', stake.userId),
      args.reviewId === undefined ? null : ctx.db.get('chargeReviews', args.reviewId),
    ]);
    if (user === null) return null;

    const timeZone = user.timeZone ?? 'UTC';
    const contract = await contractAsOf(
      ctx,
      user._id,
      { habitId: stake.habitId, goalId: stake.goalId },
      stake.lostAt ?? Number.MAX_SAFE_INTEGER,
    );
    const run = stake.run;
    const content = supportCaseEmail({
      kind: args.kind,
      userName: user.name,
      userEmail: user.email,
      userId: user._id,
      stakeId: stake._id,
      title: stake.title,
      subject: stake.habitId !== undefined ? 'habit' : 'goal',
      amountCents: stake.amountCents,
      card: cardOnFile(stake),
      status: stake.status,
      lostLabel: stake.lostAt === undefined ? undefined : dateTimeLabel(stake.lostAt, timeZone),
      runLabel:
        run === undefined
          ? undefined
          : `${run.streak} ${run.unit}${run.streak === 1 ? '' : 's'} in a row, missed ${run.missedPeriod}`,
      contractTerms: contract?.terms.map((term) => term.text).join(''),
      signedLabel: contract === null ? undefined : dateTimeLabel(contract.signedAt, timeZone),
      proofs: await recentProofs(ctx, stake, timeZone),
      paymentUrl:
        stake.stripePaymentIntentId === undefined
          ? undefined
          : `https://dashboard.stripe.com/${stripeLiveMode() ? '' : 'test/'}payments/${stake.stripePaymentIntentId}`,
      reason: review?.reason,
      note: review?.note,
    });
    await sendToSupport(ctx, content, {
      replyTo: deliverableEmail(normalizeEmail(user.email)),
      idempotencyKey: `support:${args.kind}:${stake._id}`,
    });
    return null;
  },
});

/**
 * The one-time reprieve, by email: the same words as the push, for anyone who
 * has notifications off and would otherwise not know a deadline moved.
 */
export const sendGrace = internalMutation({
  args: { graceIds: v.array(v.id('graces')) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const graces: Doc<'graces'>[] = [];
    for (const graceId of args.graceIds) {
      const grace = await ctx.db.get('graces', graceId);
      if (grace !== null) graces.push(grace);
    }
    const first = graces[0];
    if (first === undefined) return null;
    const user = await ctx.db.get('users', first.userId);
    if (user === null) return null;
    const to = deliverableEmail(normalizeEmail(user.email));
    if (to === undefined) return null;

    const stakes: GraceStake[] = [];
    for (const grace of graces) {
      const stake = await ctx.db.get('stakes', grace.stakeId);
      if (stake !== null) stakes.push(graceStakeLine(stake));
    }
    const habit = first.habitId === undefined ? null : await ctx.db.get('habits', first.habitId);
    const content = graceEmail({
      userName: firstName(user.name),
      kind: first.kind,
      titles: graces.map((grace) => grace.title),
      stakes,
      missedPeriod: first.missedPeriod,
      weekly: habit !== null && targetPerWeek(habit) < DAILY,
      originalDueAt: first.originalDueAt,
      extendedTo: first.extendedTo,
      now: first.grantedAt,
      timeZone: user.timeZone ?? 'UTC',
    });
    await sendToUser(ctx, to, content, { idempotencyKey: `grace:${first._id}` });
    return null;
  },
});

/** Mail to the user themselves, about their own commitments. */
async function sendToUser(
  ctx: MutationCtx,
  to: string,
  content: EmailContent,
  options: { idempotencyKey: string },
): Promise<void> {
  if (env.EMAIL_DELIVERY !== 'on') {
    console.log(`[email not sent] to=${to} subject="${content.subject}"\n${content.text}`);
    return;
  }
  await resend().sendEmail(ctx, {
    from: env.EMAIL_FROM ?? DEFAULT_FROM,
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: options.idempotencyKey,
  });
}

async function sendToSupport(
  ctx: MutationCtx,
  content: EmailContent,
  options: { replyTo?: string; idempotencyKey: string },
): Promise<void> {
  const to = env.SUPPORT_EMAIL ?? DEFAULT_SUPPORT_EMAIL;
  if (env.EMAIL_DELIVERY !== 'on') {
    console.log(`[email not sent] to=${to} subject="${content.subject}"\n${content.text}`);
    return;
  }
  await resend().sendEmail(ctx, {
    from: env.EMAIL_FROM ?? DEFAULT_FROM,
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    replyTo: options.replyTo === undefined ? undefined : [options.replyTo],
    idempotencyKey: options.idempotencyKey,
  });
}

/** The newest proof behind the commitment, kept past its deletion for this (`evidence.ts`). */
async function recentProofs(
  ctx: MutationCtx,
  stake: Doc<'stakes'>,
  timeZone: string,
): Promise<SupportProof[]> {
  const urls = async (ids: Doc<'goalSubmissions'>['photoIds']): Promise<string[]> => {
    const found = await Promise.all(ids.map((id) => ctx.storage.getUrl(id)));
    return found.filter((url): url is string => url !== null);
  };

  if (stake.habitId !== undefined) {
    const habitId = stake.habitId;
    const rows = await ctx.db
      .query('habitVerifications')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId))
      .order('desc')
      .take(SUPPORT_PROOFS);
    return await Promise.all(
      rows.map(async (row) => ({
        when: `${row.day} (sent ${dateTimeLabel(row.createdAt, timeZone)})`,
        method: row.method ?? 'photo',
        status: row.status,
        reason: row.reason,
        photoUrls: row.photoId === undefined ? [] : await urls([row.photoId]),
      })),
    );
  }

  if (stake.goalId !== undefined) {
    const goalId = stake.goalId;
    const rows = await ctx.db
      .query('goalSubmissions')
      .withIndex('by_goal', (q) => q.eq('goalId', goalId))
      .order('desc')
      .take(SUPPORT_PROOFS);
    return await Promise.all(
      rows.map(async (row) => ({
        when: dateTimeLabel(row.createdAt, timeZone),
        method: row.text === undefined ? 'photo' : `photo, note: “${row.text}”`,
        status: row.status,
        reason: row.reason,
        photoUrls: await urls(row.photoIds),
      })),
    );
  }

  return [];
}

/** "Sep 30, 2026, 12:05 AM CDT", in the user's own zone. */
function dateTimeLabel(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  });
}

function stripeLiveMode(): boolean {
  return /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY);
}
