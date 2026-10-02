import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { EXTENSION_MS } from './lib/grace';
import { grantPro, setup as baseSetup, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Every user here lives in UTC, so the local day ends at 03:00Z.
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

async function signIn(
  t: Harness,
  tokenIdentifier: string,
  email = `${tokenIdentifier}@example.com`,
) {
  const as = t.withIdentity({ tokenIdentifier, name: `${tokenIdentifier} Tester`, email });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  return { as, userId };
}

async function runCheck(t: Harness, day: string, hour = 4) {
  vi.setSystemTime(at(day, hour));
  await t.mutation(internal.lockouts.checkAll, {});
}

async function moneyHabit(
  t: Harness,
  userId: Id<'users'>,
  { title = 'Run', cardFingerprint }: { title?: string; cardFingerprint?: string } = {},
): Promise<Id<'habits'>> {
  return await t.mutation(internal.habits.insertStaked, {
    userId,
    title,
    amountCents: 2500,
    stripeCustomerId: 'cus_test',
    stripePaymentMethodId: 'pm_test',
    stripeSetupIntentId: `seti_${title}_${Math.random()}`,
    cardBrand: 'visa',
    cardLast4: '4242',
    cardFingerprint,
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

async function graces(t: Harness) {
  return await t.run(async (ctx) => await ctx.db.query('graces').collect());
}

async function graceUsedAt(t: Harness, userId: Id<'users'>) {
  return await t.run(async (ctx) => (await ctx.db.get('users', userId))?.graceUsedAt ?? null);
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

describe('habits', () => {
  test('a first miss costs nothing, once; the next one is charged', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);

    await runCheck(t, '2026-09-23');

    const first = await habitAndStake(t, habitId);
    expect(first.habit?.brokenAt).toBeUndefined();
    expect(first.stake).toMatchObject({ status: 'armed' });
    expect(first.stake?.lostAt).toBeUndefined();
    expect(await scheduled(t, 'stripe:chargeStake')).toHaveLength(0);
    expect(await graces(t)).toMatchObject([
      { kind: 'waived', title: 'Run', missedPeriod: '2026-09-22', stakeId: first.stake?._id },
    ]);
    expect(await graceUsedAt(t, alice.userId)).not.toBeNull();
    expect(await scheduled(t, 'emails:sendGrace')).toHaveLength(1);

    // The screen opens on it until it's seen.
    const view = await alice.as.query(api.graces.unseen, {});
    expect(view).toMatchObject({
      kind: 'waived',
      titles: ['Run'],
      stakes: [{ kind: 'money', cents: 2500 }],
      habitExists: true,
      weekly: false,
    });
    await alice.as.mutation(api.graces.setReason, { graceId: view!.graceId, reason: 'forgot' });
    await alice.as.mutation(api.graces.markSeen, { graceId: view!.graceId });
    expect(await alice.as.query(api.graces.unseen, {})).toBeNull();
    expect(await alice.as.query(api.graces.get, { graceId: view!.graceId })).toMatchObject({
      seen: true,
      reason: 'forgot',
    });

    // The next miss is the real thing.
    await runCheck(t, '2026-09-24');
    const second = await habitAndStake(t, habitId);
    expect(second.habit?.brokenAt).toBeDefined();
    expect(second.stake).toMatchObject({ status: 'charging' });
    expect(second.stake?.run).toMatchObject({ missedPeriod: '2026-09-23' });
    expect(await graces(t)).toHaveLength(1);
  });

  test('every habit missed the same day is let go together', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const runId = await moneyHabit(t, alice.userId, { title: 'Run' });
    const readId = await moneyHabit(t, alice.userId, { title: 'Read' });

    await runCheck(t, '2026-09-23');

    for (const habitId of [runId, readId]) {
      expect((await habitAndStake(t, habitId)).stake).toMatchObject({ status: 'armed' });
    }
    expect(await scheduled(t, 'stripe:chargeStake')).toHaveLength(0);
    const view = await alice.as.query(api.graces.unseen, {});
    expect(view?.titles.sort()).toEqual(['Read', 'Run']);
    expect(view?.stakes).toHaveLength(2);
  });

  test('a friend is not emailed and a lockout does not freeze', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const friendHabit = await alice.as.mutation(api.habits.create, {
      title: 'Read',
      stake: { kind: 'friend', friend: { name: 'Sam', email: 'sam@example.com' } },
    });
    const lockoutHabit = await alice.as.mutation(api.habits.create, {
      title: 'Stretch',
      stake: { kind: 'lockout', days: 3 },
    });

    await runCheck(t, '2026-09-23');

    expect((await habitAndStake(t, friendHabit)).stake).toMatchObject({ status: 'armed' });
    expect((await habitAndStake(t, lockoutHabit)).stake).toMatchObject({ status: 'armed' });
    expect(await scheduled(t, 'emails:sendLoss')).toHaveLength(0);
    expect(await t.run(async (ctx) => await ctx.db.query('freezes').collect())).toEqual([]);
  });

  test('a habit on their word does not use it up', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.habits.create, { title: 'Read', stake: { kind: 'none' } });

    await runCheck(t, '2026-09-23');

    expect(await graceUsedAt(t, alice.userId)).toBeNull();
    expect(await graces(t)).toEqual([]);
  });

  test('a day excused by our own failed check does not use it up', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    await t.run(async (ctx) => {
      await ctx.db.insert('habitVerifications', {
        userId: alice.userId,
        habitId,
        day: '2026-09-22',
        status: 'failed',
        createdAt: Date.now(),
      });
    });

    await runCheck(t, '2026-09-23');

    expect(await graceUsedAt(t, alice.userId)).toBeNull();
    expect((await habitAndStake(t, habitId)).stake).toMatchObject({ status: 'armed' });
  });
});

describe('who gets it', () => {
  test('nobody who already lost a stake', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await t.run(async (ctx) => {
      await ctx.db.insert('stakes', {
        kind: 'lockout',
        userId: alice.userId,
        title: 'Old habit',
        createdAt: 0,
        lostAt: 1,
        seenAt: 2,
        status: 'triggered',
        days: 1,
      });
    });
    const habitId = await moneyHabit(t, alice.userId);

    await runCheck(t, '2026-09-23');

    expect((await habitAndStake(t, habitId)).stake).toMatchObject({ status: 'charging' });
    expect(await graces(t)).toEqual([]);
  });

  test('not twice for the same email, even on a new account', async () => {
    vi.stubEnv('GRACE_HASH_SALT', 'test-salt');
    const t = setup();
    const alice = await signIn(t, 'alice', 'same@example.com');
    await moneyHabit(t, alice.userId);
    await runCheck(t, '2026-09-23');
    expect(await graceUsedAt(t, alice.userId)).not.toBeNull();

    // Signed up again with the same address, after deleting the first account.
    await t.run(async (ctx) => await ctx.db.patch('users', alice.userId, { email: 'gone' }));
    vi.setSystemTime(at('2026-09-23'));
    const again = await signIn(t, 'alice-again', ' Same@Example.com');
    const habitId = await moneyHabit(t, again.userId);
    await runCheck(t, '2026-09-25');

    expect((await habitAndStake(t, habitId)).stake).toMatchObject({ status: 'charging' });
    const marks = await t.run(async (ctx) => await ctx.db.query('graceMarks').collect());
    expect(marks).toHaveLength(1);
    expect(marks[0].hash).not.toContain('same');
  });

  test('not twice for the same card', async () => {
    vi.stubEnv('GRACE_HASH_SALT', 'test-salt');
    const t = setup();
    const alice = await signIn(t, 'alice');
    await moneyHabit(t, alice.userId, { cardFingerprint: 'fp_123' });
    await runCheck(t, '2026-09-23');

    vi.setSystemTime(at('2026-09-23'));
    const bob = await signIn(t, 'bob');
    const habitId = await moneyHabit(t, bob.userId, { cardFingerprint: 'fp_123' });
    await runCheck(t, '2026-09-25');

    expect((await habitAndStake(t, habitId)).stake).toMatchObject({ status: 'charging' });
  });

  test('someone else’s reprieve stays hidden', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    await moneyHabit(t, alice.userId);
    await runCheck(t, '2026-09-23');
    const [grace] = await graces(t);

    expect(await bob.as.query(api.graces.get, { graceId: grace._id })).toBeNull();
    expect(await bob.as.query(api.graces.unseen, {})).toBeNull();
    await expect(bob.as.mutation(api.graces.markSeen, { graceId: grace._id })).rejects.toThrow();
  });
});

describe('goals', () => {
  async function stakedGoal(t: Harness, alice: Awaited<ReturnType<typeof signIn>>) {
    const dueAt = at('2026-09-22').getTime();
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship',
      dueAt,
      stake: { kind: 'friend', friend: { name: 'Sam', email: 'sam@example.com' } },
    });
    const goal = await t.run(async (ctx) => await ctx.db.get('goals', goalId));
    return { goalId, dueAt, stakeId: goal!.stakeId! };
  }

  test('a first missed deadline moves 48 hours, once', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const { goalId, dueAt, stakeId } = await stakedGoal(t, alice);

    vi.setSystemTime(at('2026-09-22', 13));
    await t.mutation(internal.stakes.resolveGoal, { stakeId, attempt: 0 });

    const after = await t.run(async (ctx) => ({
      goal: await ctx.db.get('goals', goalId),
      stake: await ctx.db.get('stakes', stakeId),
    }));
    expect(after.goal).toMatchObject({ dueAt: dueAt + EXTENSION_MS, originalDueAt: dueAt });
    expect(after.stake).toMatchObject({ status: 'armed' });
    expect(after.stake?.resolveJobId).toBeDefined();
    const job = await t.run(
      async (ctx) => await ctx.db.system.get('_scheduled_functions', after.stake!.resolveJobId!),
    );
    expect(job).toMatchObject({ name: 'stakes:resolveGoal', scheduledTime: dueAt + EXTENSION_MS });
    expect(await scheduled(t, 'emails:sendLoss')).toHaveLength(0);
    expect(await alice.as.query(api.graces.unseen, {})).toMatchObject({
      kind: 'extended',
      originalDueAt: dueAt,
      extendedTo: dueAt + EXTENSION_MS,
      goalDone: false,
    });

    // Still open for proof: the deadline check passes and the photo check is next.
    await expect(
      alice.as.mutation(api.goalSubmissions.create, {
        goalId,
        photoIds: [await t.run(async (ctx) => await ctx.storage.store(new Blob(['x'])))],
      }),
    ).rejects.toThrow('not a supported image');

    // No raising the stakes in the meantime.
    expect(await alice.as.query(api.raises.target, { target: { goalId } })).toMatchObject({
      blocked: 'The stakes are set while your deadline is extended',
    });

    // Missed again: this time the friend hears.
    vi.setSystemTime(dueAt + EXTENSION_MS + 60_000);
    await t.mutation(internal.stakes.resolveGoal, { stakeId, attempt: 0 });
    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'told',
    });
  });

  test('proof during the extension lets the stake go', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const { goalId, stakeId } = await stakedGoal(t, alice);
    vi.setSystemTime(at('2026-09-22', 13));
    await t.mutation(internal.stakes.resolveGoal, { stakeId, attempt: 0 });

    vi.setSystemTime(at('2026-09-23'));
    await t.run(async (ctx) => await ctx.db.patch('goals', goalId, { completedAt: Date.now() }));
    vi.setSystemTime(at('2026-09-24', 13));
    await t.mutation(internal.stakes.resolveGoal, { stakeId, attempt: 0 });

    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'released',
    });
  });

  test('a submission still being checked is waited on first', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const { goalId, dueAt, stakeId } = await stakedGoal(t, alice);
    await t.run(async (ctx) => {
      await ctx.db.insert('goalSubmissions', {
        userId: alice.userId,
        goalId,
        photoIds: [],
        status: 'pending',
        createdAt: Date.now(),
      });
    });

    vi.setSystemTime(at('2026-09-22', 13));
    await t.mutation(internal.stakes.resolveGoal, { stakeId, attempt: 0 });

    expect(await graceUsedAt(t, alice.userId)).toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.get('goals', goalId))?.dueAt)).toBe(dueAt);
  });

  test('a habit’s reprieve leaves none for a goal', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await moneyHabit(t, alice.userId);
    const { stakeId } = await stakedGoal(t, alice);
    await runCheck(t, '2026-09-22');
    await runCheck(t, '2026-09-23');

    vi.setSystemTime(at('2026-09-23', 13));
    await t.mutation(internal.stakes.resolveGoal, { stakeId, attempt: 0 });
    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'told',
    });
  });
});
