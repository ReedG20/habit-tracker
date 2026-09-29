import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { grantPro, setup, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Everyone here lives in UTC, so local midnight is 00:00Z.
const at = (value: string) => Date.parse(value);
const TOKEN = 'ExponentPushToken[alice-phone]';

type Sent = {
  to: string;
  title: string;
  body: string;
  interruptionLevel?: string;
  collapseId?: string;
};

let sent: Sent[] = [];
let ticketError: string | null = null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21T09:00:00Z'));
  vi.stubEnv('PUSH_DELIVERY', 'on');
  sent = [];
  ticketError = null;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/push/send')) {
      const batch = JSON.parse(String(init?.body)) as Sent[];
      sent.push(...batch);
      const data = batch.map((_, index) =>
        ticketError === null
          ? { status: 'ok', id: `ticket-${sent.length}-${index}` }
          : { status: 'error', message: ticketError, details: { error: ticketError } },
      );
      return new Response(JSON.stringify({ data }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signIn(t: Harness, name: string, token: string | null = TOKEN) {
  const as = t.withIdentity({ tokenIdentifier: name, name });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  // Commitments need Pro, and only Pro's habits are held to (and reminded of).
  await grantPro(t, userId);
  if (token !== null) {
    await as.mutation(api.push.register, { token, permission: 'granted' });
  }
  return { as, userId };
}

/** Runs every scheduled function due up to `until`, one wave at a time, in order. */
async function runUntil(t: Harness, until: string) {
  const target = at(until);
  for (let wave = 0; wave < 100; wave += 1) {
    const next = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      const times = jobs
        .filter((job) => job.state.kind === 'pending')
        .map((job) => job.scheduledTime)
        .sort((a, b) => a - b);
      return times[0];
    });
    if (next === undefined || next > target) break;
    vi.advanceTimersByTime(Math.max(0, next - Date.now()));
    await t.finishInProgressScheduledFunctions();
  }
  vi.advanceTimersByTime(Math.max(0, target - Date.now()));
}

async function logDay(t: Harness, userId: Id<'users'>, habitId: Id<'habits'>, day: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert('habitCompletions', { userId, habitId, day, completedAt: Date.now() });
  });
}

const titles = () => sent.map((push) => push.title);

/** For tests that send a test push, which goes through the rate limiter component. */
function setupWithLimiter(): Harness {
  const t = setup();
  registerRateLimiter(t);
  return t;
}

describe('habit reminders', () => {
  test('one push for everything owed tonight, shrinking as things get done', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const run = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.habits.create, { title: 'Read' });

    // The day a habit is made is free: nothing on Monday.
    await runUntil(t, '2026-09-22T00:00:00Z');
    expect(sent).toEqual([]);

    // Tuesday, firm: 7 PM for both, then a last call at 10:30 for what's left.
    await runUntil(t, '2026-09-22T19:05:00Z');
    expect(titles()).toEqual(['2 still open']);
    expect(sent[0].body).toMatch(/^Run, Read\./);
    expect(sent[0].collapseId).toBe('habits:2026-09-22');

    await logDay(t, alice.userId, run, '2026-09-22');
    await runUntil(t, '2026-09-22T23:59:00Z');
    expect(titles()).toEqual(['2 still open', 'Last call: Read']);
    expect(sent[1].interruptionLevel).toBe('time-sensitive');
  });

  test('all done means silence', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const run = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await logDay(t, alice.userId, run, '2026-09-22');

    await runUntil(t, '2026-09-23T00:00:00Z');
    expect(sent).toEqual([]);
  });

  test('the preset and Focus setting shape what goes out', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.reminders.updateSettings, {
      preset: 'gentle',
      breakThroughFocus: false,
    });

    await runUntil(t, '2026-09-23T00:00:00Z');
    expect(titles()).toEqual(['Last call: Run']);
    expect(sent[0].interruptionLevel).toBe('active');
  });

  test('locked: habits go quiet, goals keep going', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.goals.create, {
      title: 'Essay',
      dueAt: at('2026-09-22T20:00:00Z'),
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('lockouts', {
        userId: alice.userId,
        status: 'active',
        lockedAt: Date.now(),
        misses: [],
      });
    });

    await runUntil(t, '2026-09-23T00:00:00Z');
    expect(titles()).toEqual(['Essay · due tomorrow 8pm', 'Essay: 5h left', 'Last call: Essay']);
  });

  test('Pro ended: habits pause and go quiet, goals keep going', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.goals.create, {
      title: 'Essay',
      dueAt: at('2026-09-22T20:00:00Z'),
    });
    await grantPro(t, alice.userId, Date.now() - 1);

    await runUntil(t, '2026-09-23T00:00:00Z');
    expect(titles()).toEqual(['Essay · due tomorrow 8pm', 'Essay: 5h left', 'Last call: Essay']);
  });
});

describe('goal reminders', () => {
  test('moving a deadline earlier re-plans it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Essay',
      dueAt: at('2026-09-28T17:00:00Z'),
    });
    await runUntil(t, '2026-09-21T10:00:00Z');

    await alice.as.mutation(api.goals.update, { goalId, dueAt: at('2026-09-21T14:00:00Z') });
    await runUntil(t, '2026-09-21T14:00:00Z');
    expect(titles()).toEqual(['Last call: Essay']);
    expect(sent[0].body).toContain('90 min');
  });

  test('proof being checked holds the nudge back', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Essay',
      dueAt: at('2026-09-21T14:00:00Z'),
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('goalSubmissions', {
        userId: alice.userId,
        goalId,
        photoIds: [],
        status: 'pending',
        createdAt: Date.now(),
      });
    });

    await runUntil(t, '2026-09-21T13:00:00Z');
    expect(sent).toEqual([]);
  });
});

describe('the reminder chain', () => {
  test('no device, no chain', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice', null);
    await alice.as.mutation(api.habits.create, { title: 'Run' });

    const state = await t.run(async (ctx) => await ctx.db.query('reminderState').first());
    expect(state?.jobId).toBeUndefined();
    await runUntil(t, '2026-09-23T00:00:00Z');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('re-planning leaves exactly one run scheduled', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.habits.create, { title: 'Read' });
    await alice.as.mutation(api.reminders.updateSettings, { preset: 'relentless' });
    await runUntil(t, '2026-09-21T09:01:00Z');

    const pending = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      return jobs.filter((job) => job.state.kind === 'pending' && job.name.includes('runUser'))
        .length;
    });
    expect(pending).toBe(1);
  });

  test('delivery off: nothing leaves the deployment', async () => {
    vi.stubEnv('PUSH_DELIVERY', '');
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run' });

    await runUntil(t, '2026-09-23T00:00:00Z');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('devices', () => {
  test('a shared phone belongs to whoever signed in last', async () => {
    const t = setup();
    await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');

    const rows = await t.run(async (ctx) => await ctx.db.query('pushTokens').collect());
    expect(rows).toMatchObject([{ userId: bob.userId, token: TOKEN }]);

    await bob.as.mutation(api.push.unregister, { token: TOKEN });
    expect(await t.run(async (ctx) => await ctx.db.query('pushTokens').collect())).toEqual([]);
  });

  test('a device Expo says is gone is forgotten; a credentials error is not', async () => {
    const t = setupWithLimiter();
    const alice = await signIn(t, 'alice');

    ticketError = 'InvalidCredentials';
    await alice.as.mutation(api.push.sendTest, {});
    await runUntil(t, '2026-09-21T09:01:00Z');
    expect(await t.run(async (ctx) => await ctx.db.query('pushTokens').collect())).toHaveLength(1);

    ticketError = 'DeviceNotRegistered';
    await alice.as.mutation(api.push.sendTest, {});
    await runUntil(t, '2026-09-21T09:02:00Z');
    expect(await t.run(async (ctx) => await ctx.db.query('pushTokens').collect())).toEqual([]);
  });

  test('the test push is rate limited', async () => {
    const t = setupWithLimiter();
    const alice = await signIn(t, 'alice');
    for (let count = 0; count < 3; count += 1) {
      expect(await alice.as.mutation(api.push.sendTest, {})).toBe(1);
    }
    await expect(alice.as.mutation(api.push.sendTest, {})).rejects.toThrow();
  });
});

describe('event pushes', () => {
  test('a rejected habit photo says how long is left to retry', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    vi.setSystemTime(at('2026-09-22T21:00:00Z'));

    const verificationId = await t.run(async (ctx) => {
      const photoId = await ctx.storage.store(new Blob(['photo'], { type: 'image/jpeg' }));
      return await ctx.db.insert('habitVerifications', {
        userId: alice.userId,
        habitId,
        day: '2026-09-22',
        photoId,
        status: 'pending',
        createdAt: Date.now(),
      });
    });
    await t.mutation(internal.verifications.resolve, {
      verificationId,
      status: 'rejected',
      reason: 'That looks like a screenshot.',
    });
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();

    expect(sent.at(-1)).toMatchObject({
      title: 'Run: photo didn’t pass',
      body: 'That looks like a screenshot. 3h left to retry.',
    });
  });

  test('a charge sends one receipt, however many times it is reported', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const stakeId = await t.run(async (ctx) => {
      const goalId = await ctx.db.insert('goals', {
        userId: alice.userId,
        title: 'Essay',
        dueAt: Date.now() - 1000,
        order: 0,
      });
      return await ctx.db.insert('stakes', {
        kind: 'money',
        userId: alice.userId,
        goalId,
        title: 'Essay',
        createdAt: 0,
        lostAt: Date.now(),
        amountCents: 2500,
        stripeCustomerId: 'cus_1',
        stripePaymentMethodId: 'pm_1',
        stripeSetupIntentId: 'seti_1',
        status: 'charging',
      });
    });

    await t.mutation(internal.stripe.recordCharge, { stakeId, paymentIntentId: 'pi_1' });
    await t.mutation(internal.stripe.recordCharge, { stakeId, paymentIntentId: 'pi_1' });
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();

    expect(sent.filter((push) => push.title === 'Essay: deadline passed')).toHaveLength(1);
  });
});
