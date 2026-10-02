import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { env, type MutationCtx } from '../_generated/server';
import { graceStakeLine, gracePushCopy } from './graceCopy';
import { deliver, eventPush, touchReminders } from './notify';

/**
 * The one-time reprieve on a first miss. The first time someone misses a
 * commitment with something staked on it, the consequence doesn't land: a
 * habit's miss is waived (no charge, no email to the friend, no lockout), and
 * a goal's deadline moves 48 hours. Then a screen says plainly that it won't
 * happen again.
 *
 * It's never advertised, and it's once per person, not per account: someone
 * who already had theirs is remembered by an HMAC of their email and card
 * (`graceMarks`), which outlives account deletion.
 *
 * Misses we already excuse because the check failed on our side never reach
 * here, so they don't use it up; neither does a habit on the user's word.
 */

/** How far a goal's deadline moves. */
export const EXTENSION_MS = 48 * 60 * 60 * 1000;
/** The least time an extension leaves, when the deadline was judged late. */
const MIN_EXTENSION_LEFT_MS = 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

/** What the reprieve needs to record once it's used: the hashes that mark this person. */
export type GraceTicket = { hashes: string[] };

/**
 * Whether the user still has their reprieve, for a miss on `stakes`. `null`
 * once it's spent: they had one, they lost a stake before (so the
 * consequence is already real to them), or their email or card did either on
 * an account since deleted.
 */
export async function graceAvailable(
  ctx: MutationCtx,
  user: Doc<'users'>,
  stakes: Doc<'stakes'>[],
): Promise<GraceTicket | null> {
  if (user.graceUsedAt !== undefined) return null;

  const lostUnseen = await ctx.db
    .query('stakes')
    .withIndex('by_user_and_seen_and_lost', (q) =>
      q.eq('userId', user._id).eq('seenAt', undefined).gt('lostAt', 0),
    )
    .first();
  // `seenAt` is only ever set on a stake that was lost.
  const lostSeen = await ctx.db
    .query('stakes')
    .withIndex('by_user_and_seen_and_lost', (q) => q.eq('userId', user._id).gt('seenAt', 0))
    .first();
  if (lostUnseen !== null || lostSeen !== null) return null;

  const hashes = await markHashes(user, stakes);
  for (const hash of hashes) {
    const mark = await ctx.db
      .query('graceMarks')
      .withIndex('by_hash', (q) => q.eq('hash', hash))
      .first();
    if (mark !== null) return null;
  }
  return { hashes };
}

/** A staked habit that missed, as the habit check found it. */
export type WaivedMiss = {
  habit: Doc<'habits'>;
  stake: Doc<'stakes'>;
  period: string;
};

/**
 * Waives every staked miss from one habit check, so nobody is forgiven one
 * habit and charged for another the same morning. The stakes stay armed and
 * the habits unbroken; only the day's record shows the miss.
 */
export async function grantWaivers(
  ctx: MutationCtx,
  user: Doc<'users'>,
  misses: WaivedMiss[],
  ticket: GraceTicket,
  now: number,
): Promise<void> {
  if (misses.length === 0) return;
  const graceIds: Id<'graces'>[] = [];
  for (const { habit, stake, period } of misses) {
    graceIds.push(
      await ctx.db.insert('graces', {
        userId: user._id,
        stakeId: stake._id,
        kind: 'waived',
        habitId: habit._id,
        title: habit.title,
        missedPeriod: period,
        grantedAt: now,
      }),
    );
  }
  await spend(ctx, user, ticket, now);

  const copy = gracePushCopy({
    kind: 'waived',
    titles: misses.map((miss) => miss.habit.title),
    stakes: misses.map((miss) => graceStakeLine(miss.stake)),
  });
  await tell(ctx, user._id, graceIds, copy, now);
}

/**
 * Moves a goal's deadline 48 hours (at least a day from now), once. Proof
 * sent before then counts as usual; at the new deadline the stake resolves
 * again, and by then the reprieve is spent.
 *
 * `dueAt` itself moves, so submissions, reminders and every screen follow it;
 * `originalDueAt` keeps the deadline as signed. The job that called this is
 * the stake's deadline job, so it isn't cancelled, only replaced.
 */
export async function grantExtension(
  ctx: MutationCtx,
  user: Doc<'users'>,
  stake: Doc<'stakes'>,
  goal: Doc<'goals'>,
  ticket: GraceTicket,
  now: number,
): Promise<void> {
  const originalDueAt = goal.originalDueAt ?? goal.dueAt;
  const extendedTo = Math.max(goal.dueAt + EXTENSION_MS, now + MIN_EXTENSION_LEFT_MS);

  await ctx.db.patch('goals', goal._id, { dueAt: extendedTo, originalDueAt });
  const resolveJobId = await ctx.scheduler.runAt(extendedTo, internal.stakes.resolveGoal, {
    stakeId: stake._id,
    attempt: 0,
  });
  await ctx.db.patch('stakes', stake._id, { resolveJobId });

  const graceId = await ctx.db.insert('graces', {
    userId: user._id,
    stakeId: stake._id,
    kind: 'extended',
    goalId: goal._id,
    title: goal.title,
    originalDueAt,
    extendedTo,
    grantedAt: now,
  });
  await spend(ctx, user, ticket, now);
  // The reminders were done with this deadline; there's a new one to warn about.
  await touchReminders(ctx, user._id);

  const copy = gracePushCopy({
    kind: 'extended',
    titles: [goal.title],
    stakes: [graceStakeLine(stake)],
    extendedTo,
    now,
    timeZone: user.timeZone ?? 'UTC',
  });
  await tell(ctx, user._id, [graceId], copy, now);
}

/** Whether a miss on the habit's current stake was let go. */
export async function wasWaived(ctx: MutationCtx, habit: Doc<'habits'>): Promise<boolean> {
  const stakeId = habit.stakeId;
  if (stakeId === undefined) return false;
  const grace = await ctx.db
    .query('graces')
    .withIndex('by_stake', (q) => q.eq('stakeId', stakeId))
    .first();
  return grace !== null;
}

/** Remembers this person, so the reprieve never comes round again. */
async function spend(
  ctx: MutationCtx,
  user: Doc<'users'>,
  ticket: GraceTicket,
  now: number,
): Promise<void> {
  await ctx.db.patch('users', user._id, { graceUsedAt: now });
  for (const hash of ticket.hashes) {
    const mark = await ctx.db
      .query('graceMarks')
      .withIndex('by_hash', (q) => q.eq('hash', hash))
      .first();
    if (mark === null) await ctx.db.insert('graceMarks', { hash, createdAt: now });
  }
}

/**
 * A push that opens the grace screen, and the same words by email, since
 * someone without notifications would otherwise not know the clock moved.
 */
async function tell(
  ctx: MutationCtx,
  userId: Id<'users'>,
  graceIds: Id<'graces'>[],
  copy: { title: string; body: string },
  now: number,
): Promise<void> {
  await deliver(ctx, userId, [
    eventPush(copy, {
      data: { kind: 'receipt', url: `/grace/${graceIds[0]}` },
      collapseId: `grace:${graceIds[0]}`,
      threadId: 'receipt',
      quiet: false,
      expiresAt: now + 72 * HOUR_MS,
    }),
  ]);
  await ctx.scheduler.runAfter(0, internal.emails.sendGrace, { graceIds });
}

/**
 * The marks for this person: their email, and the cards behind `stakes`.
 * None without `GRACE_HASH_SALT`, which leaves the reprieve once per account.
 */
async function markHashes(user: Doc<'users'>, stakes: Doc<'stakes'>[]): Promise<string[]> {
  const salt = env.GRACE_HASH_SALT;
  if (salt === undefined || salt.length === 0) return [];
  const values: string[] = [];
  const email = user.email.trim().toLowerCase();
  if (email.length > 0) values.push(`email:${email}`);
  for (const stake of stakes) {
    if (stake.kind === 'money' && stake.cardFingerprint !== undefined) {
      values.push(`card:${stake.cardFingerprint}`);
    }
  }
  return await Promise.all(values.map((value) => hmac(salt, value)));
}

async function hmac(salt: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
