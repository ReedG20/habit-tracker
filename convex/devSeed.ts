import { ConvexError, v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { daysBefore, nextDay } from './lib/days';
import { localDay, requireDevOverrides } from './lib/lockout';

/**
 * Developer tool: fills a signed-in user's account with a believable month of
 * habits, a goal, money on the line and one kept habit, for App Store and
 * marketing screenshots. Wipes their habits, goals, stakes, contracts and
 * accomplishments and milestones first. Dev deployments only:
 *
 *   bunx convex run devSeed:screenshots '{"email":"you@example.com"}'
 */

/** A loose scribble rather than a legible name: anyone's signature, nobody's in particular. */
const SIGNATURE = {
  width: 300,
  height: 96,
  strokes: [
    'M16,66 Q30,30 46,52 Q58,72 74,46 Q86,26 100,50 Q112,72 130,44 Q146,22 160,54 Q170,76 192,50 Q214,28 236,52 Q252,68 284,40',
    'M200,72 Q236,66 270,70',
  ],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The line every money contract ends with (`contract-text.ts` `withAuthorization`). */
const AUTHORIZATION = { text: ' I’m 18 or older, and I authorize Ante to make this charge.' };

export const screenshots = internalMutation({
  args: { email: v.string() },
  returns: v.object({
    runHabitId: v.id('habits'),
    accomplishmentId: v.id('accomplishments'),
  }),
  handler: async (ctx, args) => {
    requireDevOverrides();
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();
    if (user === null) throw new ConvexError(`No user with email ${args.email}`);
    const userId = user._id;
    const now = Date.now();
    const timeZone = user.timeZone ?? 'America/Los_Angeles';
    const today = localDay(now, timeZone);

    await wipe(ctx, userId);
    // Every day counts (no "free day" banner), but today is marked already
    // checked, so the habits left to prove don't come due at 3 AM.
    await ctx.db.patch('users', userId, {
      accountableFrom: daysBefore(today, 60),
      lastCheckedDay: today,
    });
    await grantPro(ctx, userId, now);

    const money = (amountCents: number) => ({
      kind: 'money' as const,
      status: 'armed' as const,
      amountCents,
      stripeCustomerId: 'cus_dev',
      stripePaymentMethodId: 'pm_dev',
      cardBrand: 'visa',
      cardLast4: '4242',
    });

    // 1. Morning run: daily photo, $50, 41 days kept, today still to prove.
    const runStart = daysBefore(today, 42);
    const runHabitId = await ctx.db.insert('habits', {
      userId,
      title: 'Go for a morning run',
      description: 'My running shoes on, outside',
      timesPerWeek: 7,
      order: 0,
      startDay: runStart,
      proofMethod: 'photo',
      icon: 'run',
    });
    const runStake = await ctx.db.insert('stakes', {
      ...money(5000),
      userId,
      habitId: runHabitId,
      title: 'Go for a morning run',
      createdAt: now - 42 * DAY_MS,
    });
    await ctx.db.patch('habits', runHabitId, { stakeId: runStake });
    await ctx.db.insert('contracts', {
      userId,
      kind: 'habit',
      habitId: runHabitId,
      terms: [
        { text: 'I will ' },
        { text: 'go for a morning run', strong: true },
        { text: ', every day. If I miss a day, ' },
        { text: '$50 is charged to my card', strong: true },
        { text: '.' },
        AUTHORIZATION,
      ],
      signature: SIGNATURE,
    });
    await logDays(ctx, userId, runHabitId, runStart, today, 'photo', () => true, false, timeZone);

    // 2. Gym: 4 a week by location, a week's lockout, done today.
    const gymStart = daysBefore(today, 35);
    const gymHabitId = await ctx.db.insert('habits', {
      userId,
      title: 'Go to the gym',
      description: 'Equinox',
      timesPerWeek: 4,
      order: 1,
      startDay: gymStart,
      proofMethod: 'location',
      icon: 'gym',
    });
    // A lockout, not money, so $200 is on the line and New can still offer money.
    const gymStake = await ctx.db.insert('stakes', {
      kind: 'lockout',
      status: 'armed',
      days: 7,
      userId,
      habitId: gymHabitId,
      title: 'Go to the gym',
      createdAt: now - 35 * DAY_MS,
    });
    await ctx.db.patch('habits', gymHabitId, { stakeId: gymStake });
    await logDays(
      ctx,
      userId,
      gymHabitId,
      gymStart,
      today,
      'location',
      (offset) => [0, 2, 4, 5].includes(offset % 7),
      true,
      timeZone,
    );

    // 3. Reading: daily 20-minute timer, 3-day lockout, today still to do.
    const readStart = daysBefore(today, 19);
    const readHabitId = await ctx.db.insert('habits', {
      userId,
      title: 'Read 20 pages',
      timesPerWeek: 7,
      order: 2,
      startDay: readStart,
      proofMethod: 'timer',
      timerMinutes: 20,
      icon: 'open-book',
    });
    const readStake = await ctx.db.insert('stakes', {
      kind: 'lockout',
      status: 'armed',
      days: 3,
      userId,
      habitId: readHabitId,
      title: 'Read 20 pages',
      createdAt: now - 19 * DAY_MS,
    });
    await ctx.db.patch('habits', readHabitId, { stakeId: readStake });
    await logDays(ctx, userId, readHabitId, readStart, today, 'timer', () => true, false, timeZone);

    // 4. Goal: novel draft, $150, due in 9 days.
    const dueAt = wallTime(daysBefore(today, -9), 21, timeZone);
    const goalId = await ctx.db.insert('goals', {
      userId,
      title: 'Finish the first draft of my novel',
      description: 'The last page of the manuscript',
      dueAt,
      order: 0,
      icon: 'write',
    });
    const goalStake = await ctx.db.insert('stakes', {
      ...money(15000),
      userId,
      goalId,
      title: 'Finish the first draft of my novel',
      createdAt: now - 20 * DAY_MS,
    });
    await ctx.db.patch('goals', goalId, { stakeId: goalStake });

    // 5. A kept habit, already finished: $100 put up and kept.
    const keptHabitId = await ctx.db.insert('habits', {
      userId,
      title: 'Meditate for ten minutes',
      timesPerWeek: 7,
      order: 99,
      startDay: daysBefore(today, 31),
      icon: 'meditate',
    });
    const keptStake = await ctx.db.insert('stakes', {
      ...money(10000),
      status: 'released',
      userId,
      habitId: keptHabitId,
      title: 'Meditate for ten minutes',
      createdAt: now - 31 * DAY_MS,
      releasedAt: now,
    });
    await ctx.db.insert('contracts', {
      userId,
      kind: 'habit',
      habitId: keptHabitId,
      terms: [
        { text: 'I will ' },
        { text: 'meditate for ten minutes', strong: true },
        { text: ', every day, through ' },
        { text: shortDay(daysBefore(today, -29)), strong: true },
        { text: '. If I miss a day, ' },
        { text: '$100 is charged to my card', strong: true },
        { text: '.' },
        AUTHORIZATION,
      ],
      signature: SIGNATURE,
    });
    const accomplishmentId = await ctx.db.insert('accomplishments', {
      userId,
      kind: 'habit',
      title: 'Meditate for ten minutes',
      stakeId: keptStake,
      habitId: keptHabitId,
      run: {
        unit: 'day',
        streak: 30,
        completions: 30,
        sinceDay: daysBefore(today, 30),
        lastDay: daysBefore(today, 1),
        timesPerWeek: 7,
      },
      // A contract is "signed" when its row is made, which is now; kept a month
      // later, so it is found and reads "you signed this 30 days ago".
      achievedAt: now + 30 * DAY_MS,
      // Seen, so it doesn't pop up over Today; open it by link instead.
      seenAt: now,
    });
    await ctx.db.delete('habits', keptHabitId);

    return { runHabitId, accomplishmentId };
  },
});

/** Logs every chosen day from the day after `start` up to today, with an approved check. */
async function logDays(
  ctx: MutationCtx,
  userId: Id<'users'>,
  habitId: Id<'habits'>,
  start: string,
  today: string,
  method: 'photo' | 'location' | 'timer',
  include: (offset: number) => boolean,
  includeToday: boolean,
  timeZone: string,
) {
  let offset = 1;
  for (let day = nextDay(start); day <= today; day = nextDay(day), offset++) {
    if (day === today ? !includeToday : !include(offset)) continue;
    const at = wallTime(day, 7, timeZone) + 25 * 60 * 1000;
    await ctx.db.insert('habitCompletions', { userId, habitId, day, completedAt: at });
    await ctx.db.insert('habitVerifications', {
      userId,
      habitId,
      day,
      method,
      placeId: method === 'location' ? 'dev-place' : undefined,
      status: 'approved',
      createdAt: at,
      resolvedAt: at,
    });
  }
}

/** `hour`:00 on `day` in `timeZone`, as a timestamp. */
function wallTime(day: string, hour: number, timeZone: string): number {
  const [year, month, date] = day.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, date, hour);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
    })
      .formatToParts(guess)
      .map((part) => [part.type, Number(part.value)]),
  );
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour);
  return guess - (shown - guess);
}

async function wipe(ctx: MutationCtx, userId: Id<'users'>) {
  const habits = await ctx.db
    .query('habits')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(100);
  for (const habit of habits) {
    for (const table of ['habitCompletions', 'habitVerifications', 'habitTimerRuns'] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_habit_and_day', (q) => q.eq('habitId', habit._id))
        .take(500);
      for (const row of rows) await ctx.db.delete(table, row._id);
    }
    await ctx.db.delete('habits', habit._id);
  }
  const goals = await ctx.db
    .query('goals')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(100);
  for (const goal of goals) await ctx.db.delete('goals', goal._id);
  const stakes = await ctx.db
    .query('stakes')
    .withIndex('by_user_and_status', (q) => q.eq('userId', userId))
    .take(500);
  for (const stake of stakes) await ctx.db.delete('stakes', stake._id);
  const contracts = await ctx.db
    .query('contracts')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(500);
  for (const contract of contracts) await ctx.db.delete('contracts', contract._id);
  const accomplishments = await ctx.db
    .query('accomplishments')
    .withIndex('by_user_and_seen_and_achieved', (q) => q.eq('userId', userId))
    .take(500);
  for (const row of accomplishments) await ctx.db.delete('accomplishments', row._id);
  // Left over from earlier runs, they'd pop up over Today.
  const milestones = await ctx.db
    .query('milestones')
    .withIndex('by_user_and_seen_and_reached', (q) => q.eq('userId', userId))
    .take(500);
  for (const row of milestones) await ctx.db.delete('milestones', row._id);
}

/** Pro like `subscriptions.devGrantPro`, but a paid, renewing year rather than a trial. */
async function grantPro(ctx: MutationCtx, userId: Id<'users'>, now: number) {
  const fields = {
    userId,
    status: 'active' as const,
    productId: 'dev_override',
    store: 'DEV',
    periodType: 'NORMAL',
    environment: 'SANDBOX' as const,
    purchasedAt: now - 42 * DAY_MS,
    expiresAt: now + 323 * DAY_MS,
    willRenew: true,
    rcAppUserId: userId,
    lastEventAt: 0,
    lastEventType: 'DEV_GRANT',
    updatedAt: now,
  };
  const existing = await ctx.db
    .query('subscriptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  if (existing === null) await ctx.db.insert('subscriptions', fields);
  else await ctx.db.replace('subscriptions', existing._id, fields);
}

/** "Sun, Nov 1", the way the contract writes an end date. */
function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
