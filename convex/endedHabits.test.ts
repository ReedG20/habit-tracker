import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { nextDay } from './lib/days';
import { grantPro, setup as baseSetup, spendGrace, type Harness } from './test.helpers';

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

describe('endedHabits.list', () => {
  test('is empty, not an error, when signed out', async () => {
    const t = setup();
    expect(await t.query(api.endedHabits.list, {})).toEqual([]);
  });

  test('a habit deleted on its word is ended, with what it logged', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Read' });
    await logDays(t, alice.userId, habitId, '2026-09-19', '2026-09-21');

    expect(await alice.as.mutation(api.habits.remove, { habitId })).toBe('deleted');

    expect(await alice.as.query(api.endedHabits.list, {})).toMatchObject([
      { title: 'Read', outcome: 'ended', completions: 3, endedAt: at('2026-09-21').getTime() },
    ]);
  });

  test('one never logged or lost leaves nothing behind', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Oops' });

    await alice.as.mutation(api.habits.remove, { habitId });

    expect(await alice.as.query(api.endedHabits.list, {})).toEqual([]);
  });

  test('one seen through its notice is kept, and opens its Kept screen', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    await logDays(t, alice.userId, habitId, '2026-09-22', '2026-09-24');
    vi.setSystemTime(at('2026-09-25'));
    expect(await alice.as.mutation(api.habits.remove, { habitId })).toBe('scheduled');
    // Still running through its notice: not past yet.
    expect(await alice.as.query(api.endedHabits.list, {})).toEqual([]);

    await logDays(t, alice.userId, habitId, '2026-09-25', '2026-10-01');
    await runCheck(t, '2026-10-02');

    const kept = await alice.as.query(api.accomplishments.unseen, {});
    const [ended] = await alice.as.query(api.endedHabits.list, {});
    expect(ended).toMatchObject({ title: 'Run', outcome: 'kept', completions: 10 });
    expect(ended.accomplishmentId).toBe(kept?._id);
    expect(ended.stakeId).toBeDefined();
  });

  test('one that broke during its notice is lost, and opens its loss screen', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await spendGrace(t, alice.userId);
    const habitId = await moneyHabit(t, alice.userId);
    const stakeId = await t.run(async (ctx) => (await ctx.db.get('habits', habitId))?.stakeId);
    vi.setSystemTime(at('2026-09-22'));
    await alice.as.mutation(api.habits.remove, { habitId });

    await runCheck(t, '2026-09-24');

    expect(await alice.as.query(api.endedHabits.list, {})).toMatchObject([
      { title: 'Run', outcome: 'lost', stakeId },
    ]);
    expect((await alice.as.query(api.endedHabits.list, {}))[0].accomplishmentId).toBeUndefined();
  });

  test('newest first, and only the caller’s', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    for (const [as, title] of [
      [alice.as, 'First'],
      [alice.as, 'Second'],
      [bob.as, 'Bob’s'],
    ] as const) {
      const habitId = await as.mutation(api.habits.create, { title });
      const userId = as === alice.as ? alice.userId : bob.userId;
      await logDays(t, userId, habitId, '2026-09-20', '2026-09-20');
      await as.mutation(api.habits.remove, { habitId });
      vi.advanceTimersByTime(60_000);
    }

    const titles = (await alice.as.query(api.endedHabits.list, {})).map((row) => row.title);
    expect(titles).toEqual(['Second', 'First']);
  });
});

describe('endedHabits.remove', () => {
  test('takes it off the list, and only for its owner', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Read' });
    await logDays(t, alice.userId, habitId, '2026-09-20', '2026-09-20');
    await alice.as.mutation(api.habits.remove, { habitId });
    const [ended] = await alice.as.query(api.endedHabits.list, {});

    await expect(
      bob.as.mutation(api.endedHabits.remove, { endedHabitId: ended._id }),
    ).rejects.toThrow('Unauthorized');
    expect(await alice.as.query(api.endedHabits.list, {})).toHaveLength(1);

    await alice.as.mutation(api.endedHabits.remove, { endedHabitId: ended._id });
    expect(await alice.as.query(api.endedHabits.list, {})).toEqual([]);
    // A second tap, or a row already gone, is not an error.
    await alice.as.mutation(api.endedHabits.remove, { endedHabitId: ended._id });
  });
});
