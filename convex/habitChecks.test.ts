import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { nextDay } from './lib/days';
import { MONEY_CAP_ERROR } from './lib/stakeRules';
import { grantPro, setup as baseSetup, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Every user here lives in UTC, so the local day ends at 03:00Z.
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

async function signIn(t: Harness, tokenIdentifier: string) {
  const as = t.withIdentity({ tokenIdentifier, name: `${tokenIdentifier} Tester` });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  return { as, userId };
}

async function runCheck(t: Harness, day: string, hour = 4) {
  vi.setSystemTime(at(day, hour));
  await t.mutation(internal.lockouts.checkAll, {});
}

async function logDay(t: Harness, userId: Id<'users'>, habitId: Id<'habits'>, day: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert('habitCompletions', { userId, habitId, day, completedAt: Date.now() });
  });
}

/** A habit with money on it, as if the card had been saved through Stripe. */
async function moneyHabit(
  t: Harness,
  userId: Id<'users'>,
  title = 'Run',
  amountCents = 2500,
): Promise<Id<'habits'>> {
  return await t.mutation(internal.habits.insertStaked, {
    userId,
    title,
    amountCents,
    stripeCustomerId: 'cus_test',
    stripePaymentMethodId: 'pm_test',
    stripeSetupIntentId: `seti_${title}_${amountCents}_${Math.random()}`,
    cardBrand: 'visa',
    cardLast4: '4242',
  });
}

async function habitAndStake(t: Harness, habitId: Id<'habits'>) {
  return await t.run(async (ctx) => {
    const habit = await ctx.db.get('habits', habitId);
    const stake = habit?.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
    return { habit, stake };
  });
}

async function scheduled(t: Harness, name: string) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query('_scheduled_functions').collect();
    return jobs.filter((job) => job.name === name && job.state.kind === 'pending');
  });
}

async function imageId(t: Harness): Promise<Id<'_storage'>> {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21'));
  vi.stubEnv('STAKES_V2', 'on');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('money', () => {
  test('a miss charges once and breaks the habit', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);

    await runCheck(t, '2026-09-23');
    await runCheck(t, '2026-09-23', 5);

    const { habit, stake } = await habitAndStake(t, habitId);
    expect(habit?.brokenAt).toBeDefined();
    expect(stake).toMatchObject({ kind: 'money', status: 'charging', amountCents: 2500 });
    expect(stake?.run).toMatchObject({ streak: 0, unit: 'day', missedPeriod: '2026-09-22' });
    expect(await scheduled(t, 'stripe:chargeStake')).toHaveLength(1);
    // No fee lock under the new rules.
    expect(await alice.as.query(api.lockouts.current, {})).toBeNull();
  });

  test('a weekly habit runs its own weeks, from the day it was made', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    // Made on Thursday: its weeks run Thursday to Wednesday, and this one counts.
    vi.setSystemTime(at('2026-09-24'));
    const habitId = await moneyHabit(t, alice.userId);
    await t.run(async (ctx) => await ctx.db.patch('habits', habitId, { timesPerWeek: 3 }));
    // The day it was made counts toward week one.
    await logDay(t, alice.userId, habitId, '2026-09-24');
    await logDay(t, alice.userId, habitId, '2026-09-27');

    // Sunday ends nothing: the week still has until Wednesday.
    await runCheck(t, '2026-09-28');
    await runCheck(t, '2026-09-30');
    expect((await habitAndStake(t, habitId)).habit?.brokenAt).toBeUndefined();

    // Wednesday ended one short.
    await runCheck(t, '2026-10-01');
    const { habit, stake } = await habitAndStake(t, habitId);
    expect(habit?.brokenAt).toBeDefined();
    expect(stake?.run).toMatchObject({
      unit: 'week',
      completions: 2,
      missedPeriod: '2026-09-24',
    });
  });

  test('a week met on its last day, after midnight, is no miss', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    vi.setSystemTime(at('2026-09-24'));
    const habitId = await moneyHabit(t, alice.userId);
    await t.run(async (ctx) => await ctx.db.patch('habits', habitId, { timesPerWeek: 2 }));
    await logDay(t, alice.userId, habitId, '2026-09-24');
    // 1 AM on Thursday the 1st still belongs to Wednesday, the week's last day:
    // the hourly check leaves it alone, and a log now counts for Wednesday.
    await runCheck(t, '2026-10-01', 1);
    expect((await habitAndStake(t, habitId)).habit?.brokenAt).toBeUndefined();
    await t.run(async (ctx) => {
      await ctx.db.insert('habitCompletions', {
        userId: alice.userId,
        habitId,
        day: '2026-09-30',
        completedAt: Date.now(),
      });
    });

    await runCheck(t, '2026-10-01');
    expect((await habitAndStake(t, habitId)).habit?.brokenAt).toBeUndefined();
  });

  test('the run it ended is kept for the loss screen', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    for (const day of ['2026-09-22', '2026-09-23', '2026-09-24']) {
      await logDay(t, alice.userId, habitId, day);
    }

    await runCheck(t, '2026-09-26');

    const { stake } = await habitAndStake(t, habitId);
    expect(stake?.run).toMatchObject({
      streak: 3,
      unit: 'day',
      completions: 3,
      sinceDay: '2026-09-21',
      missedPeriod: '2026-09-25',
    });
  });

  test('once charged, the loss waits for the user and names the card', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    await runCheck(t, '2026-09-23');
    const { stake } = await habitAndStake(t, habitId);

    // While the charge is in flight, nothing is shown yet.
    expect(await alice.as.query(api.stakes.unseenLoss, {})).toBeNull();

    await t.mutation(internal.stripe.recordCharge, {
      stakeId: stake!._id,
      paymentIntentId: 'pi_1',
    });
    expect(await alice.as.query(api.stakes.unseenLoss, {})).toMatchObject({
      title: 'Run',
      habitExists: true,
      stake: { kind: 'money', status: 'charged', amountCents: 2500, cardLast4: '4242' },
    });

    await alice.as.mutation(api.stakes.markSeen, { stakeId: stake!._id });
    expect(await alice.as.query(api.stakes.unseenLoss, {})).toBeNull();
  });

  test('another user can neither read nor dismiss the loss', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const habitId = await moneyHabit(t, alice.userId);
    await runCheck(t, '2026-09-23');
    const { stake } = await habitAndStake(t, habitId);
    await t.mutation(internal.stripe.recordCharge, {
      stakeId: stake!._id,
      paymentIntentId: 'pi_1',
    });

    expect(await bob.as.query(api.stakes.loss, { stakeId: stake!._id })).toBeNull();
    expect(await bob.as.query(api.stakes.unseenLoss, {})).toBeNull();
    await expect(bob.as.mutation(api.stakes.markSeen, { stakeId: stake!._id })).rejects.toThrow(
      /not found/,
    );
  });

  test('money on the line is capped across habits and goals', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await moneyHabit(t, alice.userId, 'Run', 5000);
    await moneyHabit(t, alice.userId, 'Read', 5000);
    await moneyHabit(t, alice.userId, 'Swim', 5000);
    await moneyHabit(t, alice.userId, 'Lift', 5000);
    await t.mutation(internal.goals.insertStaked, {
      userId: alice.userId,
      title: 'Ship',
      dueAt: Date.now() + 60 * 60 * 1000,
      amountCents: 4000,
      stripeCustomerId: 'cus_test',
      stripePaymentMethodId: 'pm_test',
      stripeSetupIntentId: 'seti_goal',
    });

    expect(await alice.as.query(api.stakes.headroom, {})).toMatchObject({
      usedCents: 24000,
      remainingCents: 1000,
    });
    // A `ConvexError`, so the reason reaches the app in production too.
    await expect(moneyHabit(t, alice.userId, 'Stretch', 1100)).rejects.toThrow(
      expect.objectContaining({ data: MONEY_CAP_ERROR }),
    );
    // Nothing half-made: the habit went with the refused stake.
    const habits = await t.run(async (ctx) => await ctx.db.query('habits').collect());
    expect(habits.map((habit) => habit.title).sort()).toEqual(['Lift', 'Read', 'Run', 'Swim']);
    await moneyHabit(t, alice.userId, 'Stretch', 1000);
  });

  test('a setup intent backs only one stake', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const args = {
      userId: alice.userId,
      title: 'Run',
      amountCents: 1000,
      stripeCustomerId: 'cus_test',
      stripePaymentMethodId: 'pm_test',
      stripeSetupIntentId: 'seti_once',
    };
    await t.mutation(internal.habits.insertStaked, args);
    await expect(t.mutation(internal.habits.insertStaked, args)).rejects.toThrow(/already used/);
  });
});

describe('friend', () => {
  test('a miss tells the friend once and breaks the habit', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'friend', friend: { name: 'Sam', email: 'Sam@Example.com ' } },
    });
    expect(await scheduled(t, 'emails:sendHeadsUp')).toHaveLength(1);

    await runCheck(t, '2026-09-23');
    await runCheck(t, '2026-09-24');

    const { habit, stake } = await habitAndStake(t, habitId);
    expect(habit?.brokenAt).toBeDefined();
    expect(stake).toMatchObject({
      kind: 'friend',
      status: 'told',
      friendName: 'Sam',
      friendEmail: 'sam@example.com',
    });
    expect(await scheduled(t, 'emails:sendLoss')).toHaveLength(1);
    expect(await alice.as.query(api.stakes.unseenLoss, {})).toMatchObject({
      stake: { kind: 'friend', friendName: 'Sam' },
    });
  });

  test('you cannot name yourself, and a friend who opted out voids the stake', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await t.run(async (ctx) => {
      await ctx.db.patch('users', alice.userId, { email: 'alice@example.com' });
    });
    await expect(
      alice.as.mutation(api.habits.create, {
        title: 'Run',
        stake: { kind: 'friend', friend: { name: 'Me', email: 'ALICE@example.com' } },
      }),
    ).rejects.toThrow(expect.objectContaining({ data: 'Pick someone other than yourself' }));

    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'friend', friend: { name: 'Sam', email: 'sam@example.com' } },
    });
    const token = await t.run(async (ctx) => (await ctx.db.query('friends').first())!.optOutToken);
    await t.mutation(internal.friends.optOut, { token, everyone: false });

    const { habit, stake } = await habitAndStake(t, habitId);
    expect(stake).toMatchObject({ status: 'void' });
    expect(habit?.brokenAt).toBeUndefined();

    // A miss now only resets the streak.
    await runCheck(t, '2026-09-23');
    expect((await habitAndStake(t, habitId)).habit?.brokenAt).toBeUndefined();

    // They can't be picked again, but the habit can take someone else.
    await expect(
      alice.as.mutation(api.habits.restart, {
        habitId,
        stake: { kind: 'friend', friend: { name: 'Sam', email: 'sam@example.com' } },
      }),
    ).rejects.toThrow(/opted out/);
    await alice.as.mutation(api.habits.restart, {
      habitId,
      stake: { kind: 'friend', friend: { name: 'Jo', email: 'jo@example.com' } },
    });
    expect((await habitAndStake(t, habitId)).stake).toMatchObject({
      status: 'armed',
      friendName: 'Jo',
    });
  });

  test('opting out of everyone suppresses the address for every user', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const friend = { name: 'Sam', email: 'sam@example.com' };
    await alice.as.mutation(api.habits.create, { title: 'Run', stake: { kind: 'friend', friend } });
    await bob.as.mutation(api.habits.create, { title: 'Read', stake: { kind: 'friend', friend } });
    const token = await t.run(async (ctx) => (await ctx.db.query('friends').first())!.optOutToken);

    await t.mutation(internal.friends.optOut, { token, everyone: true });

    const stakes = await t.run(async (ctx) => await ctx.db.query('stakes').collect());
    expect(stakes.map((stake) => stake.status)).toEqual(['void', 'void']);
    await expect(
      alice.as.mutation(api.habits.create, { title: 'Stretch', stake: { kind: 'friend', friend } }),
    ).rejects.toThrow(/not to email/);
  });
});

describe('lockout', () => {
  test('a miss freezes every habit for the chosen days, and goals keep going', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const lockHabit = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'lockout', days: 3 },
    });
    const moneyId = await moneyHabit(t, alice.userId, 'Read', 1000);
    await logDay(t, alice.userId, moneyId, '2026-09-22');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship',
      dueAt: at('2026-10-01').getTime(),
    });

    await runCheck(t, '2026-09-23');

    expect((await habitAndStake(t, lockHabit)).stake).toMatchObject({ status: 'triggered' });
    expect(await alice.as.query(api.freezes.current, {})).toMatchObject({
      startDay: '2026-09-23',
      endDay: '2026-09-25',
      endsAt: at('2026-09-26', 3).getTime(),
    });

    // Habits can't be logged; goal proof still goes in.
    await expect(
      alice.as.mutation(api.verifications.submit, {
        habitId: moneyId,
        day: '2026-09-23',
        photoId: await imageId(t),
      }),
    ).rejects.toThrow(/frozen/);
    // convex-test keeps no content type on stored files, so the image check is
    // as far as a submission can get here: past the freeze is what matters.
    await expect(
      alice.as.mutation(api.goalSubmissions.create, { goalId, photoIds: [await imageId(t)] }),
    ).rejects.toThrow('not a supported image');

    // Frozen days are never judged: the money habit isn't charged for them.
    await runCheck(t, '2026-09-26');
    const { habit, stake } = await habitAndStake(t, moneyId);
    expect(habit?.brokenAt).toBeUndefined();
    expect(stake).toMatchObject({ status: 'armed' });
  });

  test('the freeze lifts on its own, and the streak bridges across it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'lockout', days: 1 },
    });
    const readId = await alice.as.mutation(api.habits.create, {
      title: 'Read',
      stake: { kind: 'none' },
    });
    await logDay(t, alice.userId, readId, '2026-09-22');

    await runCheck(t, '2026-09-23');
    const freeze = await alice.as.query(api.freezes.current, {});
    expect(freeze).toMatchObject({ startDay: '2026-09-23', endDay: '2026-09-23' });

    vi.setSystemTime(at('2026-09-24', 3));
    await t.mutation(internal.freezes.lift, { freezeId: freeze!._id });
    expect(await alice.as.query(api.freezes.current, {})).toBeNull();

    await logDay(t, alice.userId, readId, '2026-09-24');
    const habits = await alice.as.query(api.habits.list, { today: '2026-09-24' });
    expect(habits.find((habit) => habit._id === readId)).toMatchObject({ streak: 2 });
  });

  test('a second lockout while frozen only ever extends the freeze', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'lockout', days: 7 },
    });
    await alice.as.mutation(api.habits.create, {
      title: 'Read',
      stake: { kind: 'lockout', days: 1 },
    });

    await runCheck(t, '2026-09-23');

    expect(await alice.as.query(api.freezes.current, {})).toMatchObject({
      startDay: '2026-09-23',
      endDay: '2026-09-29',
    });
    const freezes = await t.run(async (ctx) => await ctx.db.query('freezes').collect());
    expect(freezes).toHaveLength(1);
  });
});

describe('no stakes', () => {
  test('a miss only resets the streak', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'none' },
    });
    await logDay(t, alice.userId, habitId, '2026-09-22');

    await runCheck(t, '2026-09-25');

    const { habit, stake } = await habitAndStake(t, habitId);
    expect(habit?.brokenAt).toBeUndefined();
    expect(stake).toBeNull();
    const [listed] = await alice.as.query(api.habits.list, { today: '2026-09-25' });
    expect(listed).toMatchObject({ streak: 0, stakeView: null });
    expect(await alice.as.query(api.freezes.current, {})).toBeNull();
  });

  test('old builds that send no stake get the lockout they describe', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    expect((await habitAndStake(t, habitId)).stake).toMatchObject({ kind: 'lockout', days: 3 });
  });
});

describe('restart', () => {
  test('a broken habit restarts fresh, with today free', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'lockout', days: 1 },
    });
    await runCheck(t, '2026-09-23');
    await expect(
      alice.as.mutation(api.verifications.submit, {
        habitId,
        day: '2026-09-25',
        photoId: await imageId(t),
      }),
    ).rejects.toThrow();

    vi.setSystemTime(at('2026-09-25'));
    await alice.as.mutation(api.habits.restart, { habitId, stake: { kind: 'none' } });

    const { habit, stake } = await habitAndStake(t, habitId);
    expect(habit).toMatchObject({ startDay: '2026-09-25' });
    expect(habit?.brokenAt).toBeUndefined();
    expect(stake).toBeNull();

    // The restart day is free.
    await runCheck(t, '2026-09-26');
    const [listed] = await alice.as.query(api.habits.list, { today: '2026-09-26' });
    expect(listed.brokenAt).toBeUndefined();
  });

  test('a live stake cannot be swapped out', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    await expect(
      alice.as.mutation(api.habits.restart, { habitId, stake: { kind: 'none' } }),
    ).rejects.toThrow(/already has something/);
  });

  test('restarting with money can reuse the card from the stake it lost', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    await runCheck(t, '2026-09-23');

    await t.mutation(internal.habits.restartWithMoney, {
      userId: alice.userId,
      habitId,
      amountCents: 2500,
      stripeCustomerId: 'cus_test',
      stripePaymentMethodId: 'pm_test',
    });

    const { habit, stake } = await habitAndStake(t, habitId);
    expect(habit?.brokenAt).toBeUndefined();
    expect(stake).toMatchObject({ kind: 'money', status: 'armed', amountCents: 2500 });
    const stakes = await t.run(async (ctx) => await ctx.db.query('stakes').collect());
    expect(stakes.map((row) => row.status)).toEqual(['charging', 'armed']);
  });
});

describe('ending a habit', () => {
  async function logWeek(t: Harness, userId: Id<'users'>, habitId: Id<'habits'>) {
    for (let day = '2026-09-22'; day <= '2026-09-28'; day = nextDay(day)) {
      await logDay(t, userId, habitId, day);
    }
  }

  test('a staked habit gives a week’s notice, counts through it, then lets its stake go', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    vi.setSystemTime(at('2026-09-22'));

    expect(await alice.as.query(api.habits.endingTerms, { habitId, today: '2026-09-22' })).toEqual({
      kind: 'notice',
      lastDay: '2026-09-28',
    });
    expect(await alice.as.mutation(api.habits.remove, { habitId })).toBe('scheduled');
    await logWeek(t, alice.userId, habitId);

    await runCheck(t, '2026-09-28');
    expect((await habitAndStake(t, habitId)).stake).toMatchObject({ status: 'armed' });

    await runCheck(t, '2026-09-29');
    const stakes: Doc<'stakes'>[] = await t.run(
      async (ctx) => await ctx.db.query('stakes').collect(),
    );
    expect(stakes).toMatchObject([{ status: 'released' }]);
    expect(await t.run(async (ctx) => await ctx.db.get('habits', habitId))).toBeNull();
  });

  test('a miss during the notice costs the stake, and the habit goes with it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    vi.setSystemTime(at('2026-09-22'));
    await alice.as.mutation(api.habits.remove, { habitId });

    await runCheck(t, '2026-09-23');

    const stakes: Doc<'stakes'>[] = await t.run(
      async (ctx) => await ctx.db.query('stakes').collect(),
    );
    expect(stakes).toMatchObject([{ status: 'charging' }]);
    expect(await t.run(async (ctx) => await ctx.db.get('habits', habitId))).toBeNull();
  });

  test('a habit on just their word goes right away', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Read',
      stake: { kind: 'none' },
    });
    vi.setSystemTime(at('2026-09-22'));

    expect(await alice.as.query(api.habits.endingTerms, { habitId, today: '2026-09-22' })).toEqual({
      kind: 'now',
      reason: 'nothing-on-the-line',
    });
    expect(await alice.as.mutation(api.habits.remove, { habitId })).toBe('deleted');
  });

  test('keeping it going takes the ending back, until the last day has passed', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    vi.setSystemTime(at('2026-09-22'));

    await alice.as.mutation(api.habits.remove, { habitId });
    await alice.as.mutation(api.habits.keepGoing, { habitId });
    expect((await habitAndStake(t, habitId)).habit?.endsAfter).toBeUndefined();

    await alice.as.mutation(api.habits.remove, { habitId });
    vi.setSystemTime(at('2026-09-29'));
    await expect(alice.as.mutation(api.habits.keepGoing, { habitId })).rejects.toThrow(
      /already ended/,
    );
  });
});

describe('goals', () => {
  test('a friend hears about a missed deadline, and proof in time releases them', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const friend = { name: 'Sam', email: 'sam@example.com' };
    const missed = await alice.as.mutation(api.goals.create, {
      title: 'Ship',
      dueAt: at('2026-09-22').getTime(),
      stake: { kind: 'friend', friend },
    });
    const kept = await alice.as.mutation(api.goals.create, {
      title: 'Write',
      dueAt: at('2026-09-22').getTime(),
      stake: { kind: 'friend', friend },
    });
    await t.run(async (ctx) => {
      const goal = await ctx.db.get('goals', kept);
      await ctx.db.patch('goals', kept, { completedAt: Date.now() });
      await ctx.db.patch('stakes', goal!.stakeId!, {});
    });
    await expect(alice.as.mutation(api.goals.remove, { goalId: missed })).rejects.toThrow(
      /friend on it/,
    );

    vi.setSystemTime(at('2026-09-22', 13));
    const stakeIds = await t.run(async (ctx) =>
      (await ctx.db.query('goals').collect()).map((goal) => goal.stakeId!),
    );
    for (const stakeId of stakeIds) {
      await t.mutation(internal.stakes.resolveGoal, { stakeId, attempt: 0 });
    }

    const stakes = await t.run(async (ctx) => await ctx.db.query('stakes').collect());
    expect(stakes.map((stake) => [stake.title, stake.status])).toEqual([
      ['Ship', 'told'],
      ['Write', 'released'],
    ]);
  });
});
