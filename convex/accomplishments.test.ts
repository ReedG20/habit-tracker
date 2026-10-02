import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { nextDay } from './lib/days';
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

async function logDays(
  t: Harness,
  userId: Id<'users'>,
  habitId: Id<'habits'>,
  from: string,
  to: string,
) {
  await t.run(async (ctx) => {
    for (let day = from; day <= to; day = nextDay(day)) {
      await ctx.db.insert('habitCompletions', { userId, habitId, day, completedAt: Date.now() });
    }
  });
}

async function moneyHabit(t: Harness, userId: Id<'users'>): Promise<Id<'habits'>> {
  return await t.mutation(internal.habits.insertStaked, {
    userId,
    title: 'Run',
    amountCents: 2000,
    stripeCustomerId: 'cus_test',
    stripePaymentMethodId: 'pm_test',
    stripeSetupIntentId: `seti_${Math.random()}`,
    cardBrand: 'visa',
    cardLast4: '4242',
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

describe('a habit seen through its notice', () => {
  test('is kept, with the run it finished on, and shown once', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    await logDays(t, alice.userId, habitId, '2026-09-22', '2026-09-24');

    vi.setSystemTime(at('2026-09-25'));
    await alice.as.mutation(api.habits.remove, { habitId });
    await logDays(t, alice.userId, habitId, '2026-09-25', '2026-10-01');
    await runCheck(t, '2026-10-02');

    const kept = await alice.as.query(api.accomplishments.unseen, {});
    expect(kept).toMatchObject({
      kind: 'habit',
      title: 'Run',
      stake: { kind: 'money', status: 'released', amountCents: 2000 },
      run: {
        unit: 'day',
        streak: 10,
        completions: 10,
        sinceDay: '2026-09-21',
        lastDay: '2026-10-01',
        timesPerWeek: 7,
      },
    });

    await alice.as.mutation(api.accomplishments.markSeen, { accomplishmentId: kept!._id });
    expect(await alice.as.query(api.accomplishments.unseen, {})).toBeNull();
  });

  test('a miss during the notice is a loss, not a keep', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    vi.setSystemTime(at('2026-09-22'));
    await alice.as.mutation(api.habits.remove, { habitId });

    await runCheck(t, '2026-09-30');
    expect(await alice.as.query(api.accomplishments.unseen, {})).toBeNull();
  });

  test('someone else’s accomplishment stays hidden', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const id = await t.run(async (ctx) => {
      return await ctx.db.insert('accomplishments', {
        userId: alice.userId,
        kind: 'goal',
        title: 'Ship',
        achievedAt: Date.now(),
      });
    });

    expect(await bob.as.query(api.accomplishments.get, { accomplishmentId: id })).toBeNull();
    await expect(
      bob.as.mutation(api.accomplishments.markSeen, { accomplishmentId: id }),
    ).rejects.toThrow(/not found/);
  });
});

describe('a goal proven', () => {
  test('is kept, even on just their word', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship the app',
      dueAt: at('2026-09-25').getTime(),
    });
    const submissionId = await t.run(async (ctx) => {
      return await ctx.db.insert('goalSubmissions', {
        userId: alice.userId,
        goalId,
        photoIds: [],
        status: 'pending',
        createdAt: Date.now(),
      });
    });

    await t.mutation(internal.goalSubmissions.resolve, {
      submissionId,
      status: 'approved',
      reason: 'Looks shipped',
    });

    expect(await alice.as.query(api.accomplishments.unseen, {})).toMatchObject({
      kind: 'goal',
      title: 'Ship the app',
      stake: null,
      dueAt: at('2026-09-25').getTime(),
    });
  });
});

describe('going again', () => {
  test('a habit kept to its end date keeps its terms, and says so the next morning', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.push.register, {
      token: 'ExponentPushToken[alice-phone]',
      permission: 'granted',
    });
    vi.stubEnv('PUSH_DELIVERY', 'on');
    const sent: { title: string; data: { url: string } }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/push/send')) {
          const batch = JSON.parse(String(init?.body)) as typeof sent;
          sent.push(...batch);
          const data = batch.map((_, index) => ({ status: 'ok', id: `ticket-${index}` }));
          return new Response(JSON.stringify({ data }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      }),
    );

    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      description: 'Running shoes on, outside',
      endsOn: '2026-09-28',
    });
    await logDays(t, alice.userId, habitId, '2026-09-22', '2026-09-28');
    await runCheck(t, '2026-09-29');

    const kept = await alice.as.query(api.accomplishments.unseen, {});
    expect(kept).toMatchObject({ kind: 'habit', title: 'Run', run: { streak: 7 } });
    const again = await alice.as.query(api.accomplishments.again, {
      accomplishmentId: kept!._id,
    });
    expect(again).toEqual({
      kind: 'habit',
      title: 'Run',
      description: 'Running shoes on, outside',
      timesPerWeek: 7,
      proofMethod: 'photo',
      lengthDays: 8,
      stake: { kind: 'lockout', days: 3 },
      complete: true,
    });

    // Found at 4 AM, told at 9.
    vi.advanceTimersByTime(Date.parse('2026-09-29T08:59:00Z') - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect(sent.filter((push) => push.data.url.startsWith('/kept/'))).toEqual([]);
    vi.advanceTimersByTime(60 * 1000);
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    expect(sent.filter((push) => push.data.url === `/kept/${kept!._id}`)).toMatchObject([
      { title: '7 days in a row. Kept.' },
    ]);
    vi.unstubAllGlobals();
  });

  test('a goal goes again with its words, stake and length', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship the app',
      description: 'A screenshot of it live in the App Store',
      dueAt: at('2026-09-25').getTime(),
      stake: { kind: 'friend', friend: { name: 'Sam', email: 'sam@example.com' } },
    });
    const submissionId = await t.run(async (ctx) => {
      return await ctx.db.insert('goalSubmissions', {
        userId: alice.userId,
        goalId,
        photoIds: [],
        status: 'pending',
        createdAt: Date.now(),
      });
    });
    await t.mutation(internal.goalSubmissions.resolve, {
      submissionId,
      status: 'approved',
      reason: 'Looks shipped',
    });

    const kept = await alice.as.query(api.accomplishments.unseen, {});
    const again = await alice.as.query(api.accomplishments.again, {
      accomplishmentId: kept!._id,
    });
    expect(again).toMatchObject({
      kind: 'goal',
      title: 'Ship the app',
      description: 'A screenshot of it live in the App Store',
      lengthMs: 4 * 24 * 60 * 60 * 1000,
      stake: { kind: 'friend', name: 'Sam', email: 'sam@example.com' },
      complete: true,
    });
  });

  test('someone else’s terms stay hidden', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const id = await t.run(async (ctx) => {
      return await ctx.db.insert('accomplishments', {
        userId: alice.userId,
        kind: 'goal',
        title: 'Ship',
        achievedAt: Date.now(),
      });
    });
    expect(await bob.as.query(api.accomplishments.again, { accomplishmentId: id })).toBeNull();
    expect(await alice.as.query(api.accomplishments.again, { accomplishmentId: id })).toEqual({
      kind: 'goal',
      title: 'Ship',
      stake: null,
      complete: false,
    });
  });
});
