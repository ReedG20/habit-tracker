import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { nextDay } from './lib/days';
import { grantPro, setup as baseSetup, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Every user here lives in UTC.
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21'));
  vi.stubEnv('STAKES_V2', 'on');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('share.subject', () => {
  test('a money habit shows its amount and its whole streak, past the 60-day window', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await t.mutation(internal.habits.insertStaked, {
      userId: alice.userId,
      title: 'Run',
      amountCents: 2500,
      stripeCustomerId: 'cus_test',
      stripePaymentMethodId: 'pm_test',
      stripeSetupIntentId: 'seti_share',
    });
    await logDays(t, alice.userId, habitId, '2026-09-22', '2026-12-25');
    vi.setSystemTime(at('2026-12-25'));

    const subject = await alice.as.query(api.share.subject, { habitId, today: '2026-12-25' });
    expect(subject).toMatchObject({
      commitment: 'habit',
      title: 'Run',
      timesPerWeek: 7,
      stake: { kind: 'money', amountCents: 2500 },
      streak: { count: 95, unit: 'day' },
    });
  });

  test('a friend stake never names the friend', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Read',
      stake: { kind: 'friend', friend: { name: 'Sam', email: 'sam@example.com' } },
    });

    const subject = await alice.as.query(api.share.subject, { habitId, today: '2026-09-21' });
    expect(subject?.stake).toEqual({ kind: 'friend' });
    expect(JSON.stringify(subject)).not.toMatch(/Sam|sam@example/);
  });

  test('someone else’s commitment is null', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship it',
      dueAt: at('2026-10-01').getTime(),
    });

    expect(await bob.as.query(api.share.subject, { habitId, today: '2026-09-21' })).toBeNull();
    expect(await bob.as.query(api.share.subject, { goalId, today: '2026-09-21' })).toBeNull();
    expect(await alice.as.query(api.share.subject, { goalId, today: '2026-09-21' })).toMatchObject({
      commitment: 'goal',
      title: 'Ship it',
      stake: { kind: 'none' },
    });
  });
});
