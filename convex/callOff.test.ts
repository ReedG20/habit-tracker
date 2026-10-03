import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { TERMS_LOCKED } from './callOff';
import { goalCallOffUntil } from './lib/callOff';
import { setup as baseSetup, type Harness } from './test.helpers';
import { grantPro } from './test.helpers';

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

const NOW = Date.UTC(2026, 9, 1, 12);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SAM = { name: 'Sam', email: 'sam@example.com' };
const SIGNATURE = { width: 300, height: 96, strokes: ['M10,50 L40,30'] };

const card = (seti: string) => ({
  stripeCustomerId: 'cus_test',
  stripePaymentMethodId: 'pm_test',
  stripeSetupIntentId: seti,
  cardBrand: 'visa',
  cardLast4: '4242',
});

async function signIn(t: Harness, name: string) {
  const as = t.withIdentity({ tokenIdentifier: name, name });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  return { as, userId };
}

async function moneyGoal(
  t: Harness,
  userId: Id<'users'>,
  amountCents: number,
  {
    title = 'Ship',
    dueAt = NOW + 3 * DAY,
    replaces,
  }: Partial<{
    title: string;
    dueAt: number;
    replaces: Id<'goals'>;
  }> = {},
) {
  return await t.mutation(internal.goals.insertStaked, {
    userId,
    title,
    dueAt,
    amountCents,
    replaces,
    ...card(`seti_${title}_${amountCents}_${dueAt}`),
  });
}

async function moneyHabit(t: Harness, userId: Id<'users'>, amountCents: number, title = 'Run') {
  return await t.mutation(internal.habits.insertStaked, {
    userId,
    title,
    amountCents,
    ...card(`seti_${title}_${amountCents}`),
  });
}

const goalOf = (t: Harness, goalId: Id<'goals'>) =>
  t.run(async (ctx) => await ctx.db.get('goals', goalId));

async function stakesByTitle(t: Harness) {
  return await t.run(async (ctx) =>
    (await ctx.db.query('stakes').collect()).map((stake) => [stake.title, stake.status]),
  );
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

describe('calling it off', () => {
  test('a money goal goes in its window, with its contract, and nothing comes due', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await moneyGoal(t, alice.userId, 1000);
    await alice.as.mutation(api.contracts.sign, {
      target: { goalId },
      terms: [{ text: 'I will ship.' }],
      signature: SIGNATURE,
    });
    expect((await goalOf(t, goalId))?.callOffUntil).toBe(goalCallOffUntil(NOW, NOW + 3 * DAY));

    vi.setSystemTime(NOW + 7 * HOUR);
    await alice.as.mutation(api.goals.remove, { goalId });

    expect(await goalOf(t, goalId)).toBeNull();
    expect(await stakesByTitle(t)).toEqual([['Ship', 'released']]);
    expect(await t.run(async (ctx) => await ctx.db.query('contracts').collect())).toEqual([]);
    expect(await pendingJobs(t, 'stakes:resolveGoal')).toHaveLength(0);
  });

  test('once the window closes, it runs to its deadline', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await moneyGoal(t, alice.userId, 1000);

    vi.setSystemTime((await goalOf(t, goalId))!.callOffUntil!);
    await expect(alice.as.mutation(api.goals.remove, { goalId })).rejects.toThrow(
      'A goal with money on it runs to its deadline',
    );
  });

  test('a friend hears nothing until the window closes, and nothing at all if called off', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const kept = await alice.as.mutation(api.goals.create, {
      title: 'Write',
      dueAt: NOW + 3 * DAY,
      stake: { kind: 'friend', friend: SAM },
    });
    const calledOff = await alice.as.mutation(api.goals.create, {
      title: 'Ship',
      dueAt: NOW + 3 * DAY,
      stake: { kind: 'friend', friend: SAM },
    });

    const jobs = await pendingJobs(t, 'emails:sendHeadsUp');
    expect(jobs.map((job) => job.scheduledTime)).toEqual([
      goalCallOffUntil(NOW, NOW + 3 * DAY),
      goalCallOffUntil(NOW, NOW + 3 * DAY),
    ]);

    await alice.as.mutation(api.goals.remove, { goalId: calledOff });
    expect(await stakesByTitle(t)).toEqual([
      ['Write', 'armed'],
      ['Ship', 'void'],
    ]);

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.advanceTimersByTime(8 * HOUR);
    await t.finishInProgressScheduledFunctions();
    const sent = log.mock.calls.filter(([line]) => String(line).startsWith('[email not sent]'));
    log.mockRestore();
    expect(sent).toHaveLength(1);
    expect(await goalOf(t, kept)).not.toBeNull();
  });

  test('a habit’s friend hears at 8 AM, not when its window shuts at 3 AM', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'friend', friend: SAM },
    });
    const habit = await t.run(async (ctx) => await ctx.db.get('habits', habitId));
    expect(habit?.callOffUntil).toBe(Date.UTC(2026, 9, 2, 3));

    const jobs = await pendingJobs(t, 'emails:sendHeadsUp');
    expect(jobs.map((job) => job.scheduledTime)).toEqual([Date.UTC(2026, 9, 2, 8)]);
  });

  test('a habit with money goes at once in its window, with no notice', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId, 1000);
    const habit = await t.run(async (ctx) => await ctx.db.get('habits', habitId));
    // Made at noon UTC: day one starts at 3 AM.
    expect(habit?.callOffUntil).toBe(Date.UTC(2026, 9, 2, 3));

    expect(await alice.as.mutation(api.habits.remove, { habitId })).toBe('deleted');
    expect(await stakesByTitle(t)).toEqual([['Run', 'released']]);
  });

  test('a raise to a friend inside the window still waits for it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship',
      dueAt: NOW + 3 * DAY,
    });
    await alice.as.mutation(api.raises.raise, {
      target: { goalId },
      stake: { kind: 'friend', friend: SAM },
    });
    const jobs = await pendingJobs(t, 'emails:sendHeadsUp');
    expect(jobs.map((job) => job.scheduledTime)).toEqual([goalCallOffUntil(NOW, NOW + 3 * DAY)]);
  });
});

describe('changing the terms', () => {
  test('swaps the goal out, and the window never grows', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const original = await moneyGoal(t, alice.userId, 1000);
    const window = (await goalOf(t, original))!.callOffUntil!;

    vi.setSystemTime(NOW + HOUR);
    const later = await moneyGoal(t, alice.userId, 2000, {
      dueAt: NOW + 30 * DAY,
      replaces: original,
    });
    expect(await goalOf(t, original)).toBeNull();
    expect(await goalOf(t, later)).toMatchObject({ callOffUntil: window, dueAt: NOW + 30 * DAY });

    // A sooner deadline shrinks it.
    const sooner = await alice.as.mutation(api.goals.create, {
      title: 'Ship',
      dueAt: NOW + 3 * HOUR,
      replaces: later,
    });
    expect((await goalOf(t, sooner))?.callOffUntil).toBe(
      goalCallOffUntil(NOW + HOUR, NOW + 3 * HOUR),
    );
    expect(await stakesByTitle(t)).toEqual([
      ['Ship', 'released'],
      ['Ship', 'released'],
    ]);
  });

  test('frees the slot and the dollars it held', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    // Six open goals is the most, and $250 the most on the line.
    const goals = [];
    for (const [index, cents] of [5000, 5000, 5000, 5000, 5000].entries()) {
      goals.push(await moneyGoal(t, alice.userId, cents, { title: `Goal ${index}` }));
    }
    const last = await alice.as.mutation(api.goals.create, { title: 'Last', dueAt: NOW + DAY });

    const swapped = await moneyGoal(t, alice.userId, 5000, { title: 'Again', replaces: goals[0] });
    expect(await goalOf(t, swapped)).not.toBeNull();
    const plain = await alice.as.mutation(api.goals.create, {
      title: 'Last again',
      dueAt: NOW + DAY,
      replaces: last,
    });
    expect(await goalOf(t, plain)).not.toBeNull();
  });

  test('refused after the window, for someone else’s goal, and rolled back on failure', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const goalId = await moneyGoal(t, alice.userId, 1000);

    await expect(
      bob.as.mutation(api.goals.create, { title: 'Mine', dueAt: NOW + DAY, replaces: goalId }),
    ).rejects.toThrow('Goal not found');

    // A deadline in the past fails after the swap started: the old goal stays.
    await expect(
      alice.as.mutation(api.goals.create, { title: 'Ship', dueAt: NOW, replaces: goalId }),
    ).rejects.toThrow('at least a minute');
    expect(await goalOf(t, goalId)).not.toBeNull();
    expect(await stakesByTitle(t)).toEqual([['Ship', 'armed']]);

    vi.setSystemTime((await goalOf(t, goalId))!.callOffUntil!);
    await expect(
      alice.as.mutation(api.goals.create, { title: 'Ship', dueAt: NOW + DAY, replaces: goalId }),
    ).rejects.toThrow('It’s past the time to change this one');
  });

  test('a habit swaps for new terms inside its window', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const original = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      stake: { kind: 'lockout', days: 3 },
    });
    const swapped = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      timesPerWeek: 3,
      stake: { kind: 'friend', friend: SAM },
      replaces: original,
    });
    const habits = await t.run(async (ctx) => await ctx.db.query('habits').collect());
    expect(habits.map((habit) => [habit._id, habit.timesPerWeek])).toEqual([[swapped, 3]]);
    expect(await stakesByTitle(t)).toEqual([
      ['Run', 'released'],
      ['Run', 'armed'],
    ]);
  });
});

describe('revisable', () => {
  test('hands the flow the terms to start from, for the owner only', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const goalId = await moneyGoal(t, alice.userId, 1500);

    expect(await alice.as.query(api.callOff.revisable, { goalId })).toMatchObject({
      kind: 'goal',
      title: 'Ship',
      dueAt: NOW + 3 * DAY,
      stake: { kind: 'money', amountCents: 1500, cardLast4: '4242' },
    });
    expect(await bob.as.query(api.callOff.revisable, { goalId })).toBeNull();
  });

  test('a habit’s end date comes along, so it can be changed while it still can', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, {
      title: 'Read',
      stake: { kind: 'none' },
      endsOn: '2026-11-01',
    });

    expect(await alice.as.query(api.callOff.revisable, { habitId })).toMatchObject({
      kind: 'habit',
      endsOn: '2026-11-01',
    });
  });
});

describe('locking the terms', () => {
  const habitOf = (t: Harness, habitId: Id<'habits'>) =>
    t.run(async (ctx) => await ctx.db.get('habits', habitId));

  test('a goal’s wording and deadline change in its window, not after; its icon always can', async () => {
    const t = setup();
    const { as } = await signIn(t, 'alice');
    const goalId = await as.mutation(api.goals.create, {
      title: 'Ship it',
      description: 'The shipped page',
      dueAt: NOW + 3 * DAY,
    });

    await as.mutation(api.goals.update, { goalId, title: 'Ship v1', dueAt: NOW + 4 * DAY });
    expect(await goalOf(t, goalId)).toMatchObject({ title: 'Ship v1', dueAt: NOW + 4 * DAY });

    vi.setSystemTime((await goalOf(t, goalId))!.callOffUntil!);
    await expect(as.mutation(api.goals.update, { goalId, title: 'Ship anything' })).rejects.toThrow(
      TERMS_LOCKED,
    );
    await expect(
      as.mutation(api.goals.update, { goalId, description: 'Any photo' }),
    ).rejects.toThrow(TERMS_LOCKED);
    await expect(as.mutation(api.goals.update, { goalId, dueAt: NOW + 6 * DAY })).rejects.toThrow(
      TERMS_LOCKED,
    );

    // The sheet resends the words as they are alongside a new icon.
    await as.mutation(api.goals.update, {
      goalId,
      title: 'Ship v1',
      description: 'The shipped page',
      icon: 'run',
    });
    expect(await goalOf(t, goalId)).toMatchObject({
      title: 'Ship v1',
      description: 'The shipped page',
      dueAt: NOW + 4 * DAY,
      icon: 'run',
      iconChosen: true,
    });
  });

  test('a habit locks the same way, with money on it or only its word', async () => {
    const t = setup();
    const { as, userId } = await signIn(t, 'alice');
    const staked = await moneyHabit(t, userId, 1000, 'Run');
    const word = await as.mutation(api.habits.create, {
      title: 'Read',
      description: 'The open page',
      proofMethod: 'photo',
      stake: { kind: 'none' },
    });

    await as.mutation(api.habits.update, { habitId: word, description: 'Twenty pages' });
    expect(await habitOf(t, word)).toMatchObject({ description: 'Twenty pages' });

    const closes = Math.max(
      (await habitOf(t, staked))!.callOffUntil!,
      (await habitOf(t, word))!.callOffUntil!,
    );
    vi.setSystemTime(closes);
    for (const habitId of [staked, word]) {
      await expect(as.mutation(api.habits.update, { habitId, title: 'Anything' })).rejects.toThrow(
        TERMS_LOCKED,
      );
      await expect(
        as.mutation(api.habits.update, { habitId, description: 'Any photo' }),
      ).rejects.toThrow(TERMS_LOCKED);
      await as.mutation(api.habits.update, { habitId, icon: 'run' });
    }
    expect(await habitOf(t, word)).toMatchObject({
      title: 'Read',
      description: 'Twenty pages',
      icon: 'run',
    });
  });

  test('a commitment from before there were windows is locked', async () => {
    const t = setup();
    const { as } = await signIn(t, 'alice');
    const goalId = await as.mutation(api.goals.create, { title: 'Ship it', dueAt: NOW + 3 * DAY });
    await t.run(async (ctx) => await ctx.db.patch('goals', goalId, { callOffUntil: undefined }));

    await expect(as.mutation(api.goals.update, { goalId, title: 'Ship v1' })).rejects.toThrow(
      TERMS_LOCKED,
    );
  });
});
