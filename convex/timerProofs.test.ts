import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { grantPro, setup as baseSetup, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Everyone here lives in UTC, so the local day ends at 03:00Z.
const at = (day: string, hour = 12, minute = 0) =>
  new Date(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);

const MINUTE = 60 * 1000;

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

async function signIn(t: Harness, tokenIdentifier: string) {
  const as = t.withIdentity({ tokenIdentifier, name: tokenIdentifier });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  return { as, userId };
}

async function timerHabit(as: Awaited<ReturnType<typeof signIn>>['as'], timerMinutes = 20) {
  return await as.mutation(api.habits.create, {
    title: 'Meditate',
    description: 'Sit on my cushion',
    proofMethod: 'timer',
    timerMinutes,
    stake: { kind: 'none' },
  });
}

async function dayState(t: Harness, habitId: Id<'habits'>, day: string) {
  return await t.run(async (ctx) => {
    const completion = await ctx.db
      .query('habitCompletions')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId).eq('day', day))
      .unique();
    const verifications = await ctx.db
      .query('habitVerifications')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId).eq('day', day))
      .collect();
    const habit = await ctx.db.get('habits', habitId);
    return { completion, verifications, habit };
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

describe('making a timer habit', () => {
  test('needs a length from the list, and only timers take one', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');

    await expect(
      alice.as.mutation(api.habits.create, { title: 'Read', proofMethod: 'timer' }),
    ).rejects.toThrow('Pick how long the timer runs');
    await expect(
      alice.as.mutation(api.habits.create, {
        title: 'Read',
        proofMethod: 'timer',
        timerMinutes: 7,
      }),
    ).rejects.toThrow('Pick how long the timer runs');
    await expect(
      alice.as.mutation(api.habits.create, {
        title: 'Read',
        proofMethod: 'photo',
        timerMinutes: 20,
      }),
    ).rejects.toThrow('Only a timer habit has a length');

    const habitId = await timerHabit(alice.as);
    const { habit } = await dayState(t, habitId, '2026-09-21');
    expect(habit).toMatchObject({ proofMethod: 'timer', timerMinutes: 20 });
  });

  test('the one-minute timer is for dev deployments only', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');

    await expect(timerHabit(alice.as, 1)).rejects.toThrow('Pick how long the timer runs');
    vi.stubEnv('ANTE_DEV_OVERRIDES', '1');
    await expect(timerHabit(alice.as, 1)).resolves.toBeDefined();
  });
});

describe('running a timer', () => {
  test('finishing on time logs the day', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await timerHabit(alice.as);

    const run = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' });
    expect(run.durationMs).toBe(20 * MINUTE);

    vi.setSystemTime(at('2026-09-21', 12, 20));
    await alice.as.mutation(api.timerProofs.finish, { runId: run.runId });

    const { completion, verifications } = await dayState(t, habitId, '2026-09-21');
    expect(completion).not.toBeNull();
    expect(verifications).toEqual([
      expect.objectContaining({ method: 'timer', status: 'approved' }),
    ]);
  });

  test('finishing early is refused', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await timerHabit(alice.as);

    const run = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' });
    vi.setSystemTime(at('2026-09-21', 12, 19));
    await expect(alice.as.mutation(api.timerProofs.finish, { runId: run.runId })).rejects.toThrow(
      'The timer isn’t done yet',
    );

    const { completion } = await dayState(t, habitId, '2026-09-21');
    expect(completion).toBeNull();
  });

  test('a late-night run still counts for the day before', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await timerHabit(alice.as);

    // 12:30 AM on Tuesday: Monday's day runs until 3 AM.
    vi.setSystemTime(at('2026-09-22', 0, 30));
    const run = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-22' });
    vi.setSystemTime(at('2026-09-22', 0, 50));
    expect(await alice.as.mutation(api.timerProofs.finish, { runId: run.runId })).toEqual({
      logged: true,
    });
    const { completion } = await dayState(t, habitId, '2026-09-21');
    expect(completion).not.toBeNull();
  });

  test('a run that would pass the end of the day at 3 AM is refused', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await timerHabit(alice.as);

    vi.setSystemTime(at('2026-09-22', 2, 45));
    await expect(
      alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' }),
    ).rejects.toThrow('There isn’t enough of today left for a 20-minute timer');
  });

  test('a run finished long after it ran out was left, and doesn’t count', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await timerHabit(alice.as);

    const run = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' });
    vi.setSystemTime(at('2026-09-21', 12, 26));
    expect(await alice.as.mutation(api.timerProofs.finish, { runId: run.runId })).toEqual({
      logged: false,
    });

    const { completion } = await dayState(t, habitId, '2026-09-21');
    expect(completion).toBeNull();
    await expect(alice.as.mutation(api.timerProofs.finish, { runId: run.runId })).rejects.toThrow(
      'This timer already ended',
    );
  });

  test('a run has to end a couple of minutes before the day does', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await timerHabit(alice.as);

    vi.setSystemTime(at('2026-09-22', 2, 39));
    await expect(
      alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' }),
    ).rejects.toThrow('There isn’t enough of today left');
    vi.setSystemTime(at('2026-09-22', 2, 37));
    await expect(
      alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' }),
    ).resolves.toBeDefined();
  });

  test('only the habit’s owner can end it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const habitId = await timerHabit(alice.as);

    const run = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' });
    await expect(
      bob.as.mutation(api.timerProofs.abandon, { runId: run.runId, reason: 'stopped' }),
    ).rejects.toThrow('Timer not found');
    await expect(
      bob.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' }),
    ).rejects.toThrow('Unauthorized');
  });

  test('a photo habit can’t be proved with a timer', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'none' },
    });

    await expect(
      alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' }),
    ).rejects.toThrow('This habit is proved another way');
  });
});

describe('cutting a timer short', () => {
  test('is a failed attempt: the day stays open and a new run can still log it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await timerHabit(alice.as);

    const first = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' });
    vi.setSystemTime(at('2026-09-21', 12, 12));
    await alice.as.mutation(api.timerProofs.abandon, { runId: first.runId, reason: 'left' });
    // The app retries the report after being suspended; the second one is a no-op.
    await alice.as.mutation(api.timerProofs.abandon, { runId: first.runId, reason: 'left' });

    let state = await dayState(t, habitId, '2026-09-21');
    expect(state.completion).toBeNull();
    expect(state.verifications).toEqual([
      expect.objectContaining({
        method: 'timer',
        status: 'rejected',
        reason:
          'You left Ante 12 minutes in, so it didn’t count. Start again whenever you’re ready.',
      }),
    ]);
    await expect(alice.as.mutation(api.timerProofs.finish, { runId: first.runId })).rejects.toThrow(
      'This timer already ended',
    );

    const second = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' });
    vi.setSystemTime(at('2026-09-21', 12, 32));
    await alice.as.mutation(api.timerProofs.finish, { runId: second.runId });

    state = await dayState(t, habitId, '2026-09-21');
    expect(state.completion).not.toBeNull();
  });

  test('never breaks the streak on its own; only a day with no log does', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await timerHabit(alice.as);

    // Tuesday: cut short, then finished properly.
    vi.setSystemTime(at('2026-09-22', 9));
    const cut = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-22' });
    await alice.as.mutation(api.timerProofs.abandon, { runId: cut.runId, reason: 'stopped' });
    const run = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-22' });
    vi.setSystemTime(at('2026-09-22', 9, 21));
    await alice.as.mutation(api.timerProofs.finish, { runId: run.runId });

    vi.setSystemTime(at('2026-09-23', 1));
    await t.mutation(internal.lockouts.checkAll, {});

    const { habit } = await dayState(t, habitId, '2026-09-22');
    expect(habit?.brokenAt).toBeUndefined();
  });

  test('a run the app never ended is dropped when the next one starts', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await timerHabit(alice.as);

    const lost = await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' });
    vi.setSystemTime(at('2026-09-21', 13));
    await alice.as.mutation(api.timerProofs.start, { habitId, day: '2026-09-21' });

    await expect(alice.as.mutation(api.timerProofs.finish, { runId: lost.runId })).rejects.toThrow(
      'This timer already ended',
    );
  });
});
