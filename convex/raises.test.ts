import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { PRO_REQUIRED } from './lib/entitlements';
import { MONEY_CAP_ERROR } from './lib/stakeRules';
import { setup as baseSetup, signIn, type Harness } from './test.helpers';

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

const NOW = Date.UTC(2026, 8, 30, 12);
const DAY_MS = 24 * 60 * 60 * 1000;
const SAM = { name: 'Sam', email: 'sam@example.com' };

const card = (seti: string) => ({
  stripeCustomerId: 'cus_test',
  stripePaymentMethodId: 'pm_test',
  stripeSetupIntentId: seti,
  cardBrand: 'visa',
  cardLast4: '4242',
});

async function moneyHabit(t: Harness, userId: Id<'users'>, amountCents: number, title = 'Run') {
  return await t.mutation(internal.habits.insertStaked, {
    userId,
    title,
    amountCents,
    ...card(`seti_${title}_${amountCents}`),
  });
}

async function stakeOfHabit(t: Harness, habitId: Id<'habits'>) {
  return await t.run(async (ctx) => {
    const habit = await ctx.db.get('habits', habitId);
    return habit?.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
  });
}

async function stakeOfGoal(t: Harness, goalId: Id<'goals'>) {
  return await t.run(async (ctx) => {
    const goal = await ctx.db.get('goals', goalId);
    return goal?.stakeId === undefined ? null : await ctx.db.get('stakes', goal.stakeId);
  });
}

async function pendingJobs(t: Harness, name: string) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query('_scheduled_functions').collect();
    return jobs.filter((job) => job.name === name && job.state.kind === 'pending');
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv('STAKES_V2', 'on');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('raises.raise', () => {
  test('no stake to a lockout, then a longer one in place', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'none' },
    });

    await alice.as.mutation(api.raises.raise, {
      target: { habitId },
      stake: { kind: 'lockout', days: 3 },
    });
    const first = await stakeOfHabit(t, habitId);
    expect(first).toMatchObject({ kind: 'lockout', status: 'armed', days: 3 });

    await alice.as.mutation(api.raises.raise, {
      target: { habitId },
      stake: { kind: 'lockout', days: 7 },
    });
    const second = await stakeOfHabit(t, habitId);
    expect(second).toMatchObject({ _id: first?._id, days: 7 });
  });

  test('a lockout to a friend lets the lockout go and tells the friend', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'lockout', days: 7 },
    });
    const before = await stakeOfHabit(t, habitId);

    await alice.as.mutation(api.raises.raise, {
      target: { habitId },
      stake: { kind: 'friend', friend: SAM },
    });

    expect(await stakeOfHabit(t, habitId)).toMatchObject({
      kind: 'friend',
      status: 'armed',
      friendName: 'Sam',
    });
    const old = await t.run(async (ctx) => ctx.db.get('stakes', before!._id));
    expect(old).toMatchObject({ status: 'released' });
    expect(await pendingJobs(t, 'emails:sendHeadsUp')).toHaveLength(1);
  });

  test('money goes up in place, and the cap counts only the difference', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId, 5000, 'Run');
    await moneyHabit(t, alice.userId, 5000, 'Read');
    const small = await moneyHabit(t, alice.userId, 4000, 'Write');
    const before = await stakeOfHabit(t, small);

    // $50 is the most one stake can be, cap or no cap.
    await expect(
      alice.as.mutation(api.raises.raise, {
        target: { habitId: small },
        stake: { kind: 'money', amountCents: 5100 },
      }),
    ).rejects.toThrow('A stake can be at most $50');
    await alice.as.mutation(api.raises.raise, {
      target: { habitId: small },
      stake: { kind: 'money', amountCents: 5000 },
    });
    expect(await stakeOfHabit(t, small)).toMatchObject({ _id: before?._id, amountCents: 5000 });

    // Now at the cap; a $50 stake can't go higher anyway.
    await expect(
      alice.as.mutation(api.raises.raise, {
        target: { habitId },
        stake: { kind: 'money', amountCents: 5100 },
      }),
    ).rejects.toThrow();
  });

  test('a raise that would pass the cap is refused', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await moneyHabit(t, alice.userId, 5000, 'Run');
    await moneyHabit(t, alice.userId, 5000, 'Read');
    await moneyHabit(t, alice.userId, 5000, 'Lift');
    await moneyHabit(t, alice.userId, 5000, 'Stretch');
    await moneyHabit(t, alice.userId, 1500, 'Swim');
    const habitId = await moneyHabit(t, alice.userId, 3000, 'Write');

    // $245 armed: +$10 would make $255.
    await expect(
      alice.as.mutation(api.raises.raise, {
        target: { habitId },
        stake: { kind: 'money', amountCents: 4000 },
      }),
    ).rejects.toThrow(MONEY_CAP_ERROR);
  });

  test('refuses anything that isn’t a raise', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'friend', friend: SAM },
    });

    await expect(
      alice.as.mutation(api.raises.raise, {
        target: { habitId },
        stake: { kind: 'lockout', days: 7 },
      }),
    ).rejects.toThrow('That wouldn’t raise the stakes');
    await expect(
      alice.as.mutation(api.raises.raise, {
        target: { habitId },
        stake: { kind: 'friend', friend: { name: 'Max', email: 'max@example.com' } },
      }),
    ).rejects.toThrow('That wouldn’t raise the stakes');
    // Money without a card goes through `raiseWithCard`.
    await expect(
      alice.as.mutation(api.raises.raise, {
        target: { habitId },
        stake: { kind: 'money', amountCents: 2000 },
      }),
    ).rejects.toThrow('Add a card for the stake');
  });

  test('a friend who opted out can be replaced by another friend', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'friend', friend: SAM },
    });
    const before = await stakeOfHabit(t, habitId);
    await t.run(async (ctx) => ctx.db.patch('stakes', before!._id, { status: 'void' }));

    await alice.as.mutation(api.raises.raise, {
      target: { habitId },
      stake: { kind: 'friend', friend: { name: 'Max', email: 'max@example.com' } },
    });
    expect(await stakeOfHabit(t, habitId)).toMatchObject({ friendName: 'Max', status: 'armed' });
  });

  test('refuses a broken or ending habit, a stake that came due, and someone without Pro', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const broken = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'none' },
    });
    const ending = await alice.as.mutation(api.habits.create, {
      title: 'Read',
      stake: { kind: 'none' },
    });
    const charging = await moneyHabit(t, alice.userId, 1000, 'Write');
    await t.run(async (ctx) => {
      await ctx.db.patch('habits', broken, { brokenAt: NOW });
      await ctx.db.patch('habits', ending, { endsAfter: '2026-10-07' });
      const stake = await ctx.db.get('habits', charging);
      await ctx.db.patch('stakes', stake!.stakeId!, { status: 'charging' });
    });
    const lockout = { kind: 'lockout' as const, days: 3 as const };

    await expect(
      alice.as.mutation(api.raises.raise, { target: { habitId: broken }, stake: lockout }),
    ).rejects.toThrow('restart it');
    await expect(
      alice.as.mutation(api.raises.raise, { target: { habitId: ending }, stake: lockout }),
    ).rejects.toThrow('This habit is ending');
    await expect(
      alice.as.mutation(api.raises.raise, {
        target: { habitId: charging },
        stake: { kind: 'money', amountCents: 2000 },
      }),
    ).rejects.toThrow('Its stake already came due');

    const bob = await signIn(t, 'bob', { pro: false });
    const bobs = await t.run(async (ctx) =>
      ctx.db.insert('habits', { userId: bob.userId, title: 'Swim', order: 0 }),
    );
    await expect(
      bob.as.mutation(api.raises.raise, { target: { habitId: bobs }, stake: lockout }),
    ).rejects.toThrow(PRO_REQUIRED);

    // Nor someone else's habit.
    await expect(
      bob.as.mutation(api.raises.raise, { target: { habitId: ending }, stake: lockout }),
    ).rejects.toThrow('Habit not found');
  });

  test('a goal’s new friend gets the deadline job, and the old one is cancelled', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship it',
      description: 'A screenshot of the release',
      dueAt: NOW + 3 * DAY_MS,
    });
    expect(await pendingJobs(t, 'stakes:resolveGoal')).toHaveLength(0);

    await alice.as.mutation(api.raises.raise, {
      target: { goalId },
      stake: { kind: 'friend', friend: SAM },
    });
    const friend = await stakeOfGoal(t, goalId);
    expect(friend).toMatchObject({ kind: 'friend', status: 'armed' });
    expect(await pendingJobs(t, 'stakes:resolveGoal')).toHaveLength(1);

    await t.mutation(internal.raises.armMoney, {
      userId: alice.userId,
      target: { goalId },
      amountCents: 1000,
      ...card('seti_goal'),
    });
    expect(await stakeOfGoal(t, goalId)).toMatchObject({ kind: 'money', amountCents: 1000 });
    const old = await t.run(async (ctx) => ctx.db.get('stakes', friend!._id));
    expect(old).toMatchObject({ status: 'released' });
    const jobs = await pendingJobs(t, 'stakes:resolveGoal');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({ stakeId: (await stakeOfGoal(t, goalId))?._id });
  });

  test('a goal can’t be raised right before its deadline, or once it’s done', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship it',
      description: 'A screenshot of the release',
      dueAt: NOW + 90 * 1000,
    });
    vi.setSystemTime(NOW + 60 * 1000);
    await expect(
      alice.as.mutation(api.raises.raise, {
        target: { goalId },
        stake: { kind: 'friend', friend: SAM },
      }),
    ).rejects.toThrow('too close to the deadline');

    await t.run(async (ctx) => ctx.db.patch('goals', goalId, { completedAt: NOW }));
    await expect(
      alice.as.mutation(api.raises.raise, {
        target: { goalId },
        stake: { kind: 'friend', friend: SAM },
      }),
    ).rejects.toThrow('This goal is already done');
  });
});

describe('raises.armMoney', () => {
  test('replacing a friend with money takes at least $10', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'friend', friend: SAM },
    });

    await expect(
      t.mutation(internal.raises.armMoney, {
        userId: alice.userId,
        target: { habitId },
        amountCents: 500,
        ...card('seti_low'),
      }),
    ).rejects.toThrow('Replacing a friend takes at least $10');

    await t.mutation(internal.raises.armMoney, {
      userId: alice.userId,
      target: { habitId },
      amountCents: 1000,
      ...card('seti_ok'),
    });
    expect(await stakeOfHabit(t, habitId)).toMatchObject({
      kind: 'money',
      status: 'armed',
      amountCents: 1000,
      cardLast4: '4242',
    });
  });

  test('from a lockout, a dollar is enough', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'lockout', days: 3 },
    });
    await t.mutation(internal.raises.armMoney, {
      userId: alice.userId,
      target: { habitId },
      amountCents: 100,
      ...card('seti_dollar'),
    });
    expect(await stakeOfHabit(t, habitId)).toMatchObject({ kind: 'money', amountCents: 100 });
  });
});

describe('raises.firstCommitment', () => {
  test('offers the oldest commitment until it has money on it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    expect(await alice.as.query(api.raises.firstCommitment, {})).toBeNull();

    await alice.as.mutation(api.users.saveOnboarding, { areas: ['fitness'] });
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'friend', friend: SAM },
    });
    vi.setSystemTime(NOW + 1000);
    await alice.as.mutation(api.habits.create, { title: 'Read', stake: { kind: 'none' } });

    expect(await alice.as.query(api.raises.firstCommitment, {})).toMatchObject({
      target: { habitId },
      title: 'Run',
      stake: { kind: 'friend', friendName: 'Sam' },
      onboardedAt: NOW,
    });

    await t.mutation(internal.raises.armMoney, {
      userId: alice.userId,
      target: { habitId },
      amountCents: 1000,
      ...card('seti_first'),
    });
    expect(await alice.as.query(api.raises.firstCommitment, {})).toBeNull();
  });

  test('gone once it’s been raised to anything, not just money', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.users.saveOnboarding, { areas: ['focus'] });
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Focus',
      stake: { kind: 'none' },
    });
    expect(await alice.as.query(api.raises.firstCommitment, {})).not.toBeNull();

    vi.setSystemTime(NOW + DAY_MS);
    await alice.as.mutation(api.raises.raise, {
      target: { habitId },
      stake: { kind: 'lockout', days: 1 },
    });
    expect(await stakeOfHabit(t, habitId)).toMatchObject({ raisedAt: NOW + DAY_MS });
    expect(await alice.as.query(api.raises.firstCommitment, {})).toBeNull();
  });

  test('a lock made longer in place counts as raised', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.users.saveOnboarding, { areas: ['focus'] });
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Focus',
      stake: { kind: 'lockout', days: 1 },
    });
    expect(await alice.as.query(api.raises.firstCommitment, {})).not.toBeNull();

    await alice.as.mutation(api.raises.raise, {
      target: { habitId },
      stake: { kind: 'lockout', days: 3 },
    });
    expect(await alice.as.query(api.raises.firstCommitment, {})).toBeNull();
  });

  test('a raise from before `raisedAt` was kept still counts', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.users.saveOnboarding, { areas: ['focus'] });
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Focus',
      stake: { kind: 'none' },
    });
    vi.setSystemTime(NOW + DAY_MS);
    await alice.as.mutation(api.raises.raise, {
      target: { habitId },
      stake: { kind: 'lockout', days: 1 },
    });
    // As the stake looked when raises didn't record it: newer than its habit, nothing more.
    await t.run(async (ctx) => {
      const stake = await ctx.db
        .query('stakes')
        .withIndex('by_habit', (q) => q.eq('habitId', habitId))
        .first();
      if (stake !== null) await ctx.db.patch('stakes', stake._id, { raisedAt: undefined });
    });
    expect(await alice.as.query(api.raises.firstCommitment, {})).toBeNull();
  });

  test('nothing for someone who never went through onboarding', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Run', stake: { kind: 'none' } });
    expect(await alice.as.query(api.raises.firstCommitment, {})).toBeNull();
  });
});
