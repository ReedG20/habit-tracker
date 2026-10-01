import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { setup, signIn, type Harness } from './test.helpers';

const TERMS = [
  { text: 'I will ' },
  { text: 'run', strong: true },
  { text: ', every day. If I miss a day, ' },
  { text: 'all my habits freeze for 3 days', strong: true },
  { text: '.' },
];
const SIGNATURE = {
  width: 300,
  height: 96,
  strokes: ['M10,50 Q12.5,48 15,47 L40,30', 'M60,60 l0.1,0'],
};

/** A lost lockout stake on `habitId`, lost at the current fake time. */
async function lose(t: Harness, userId: Id<'users'>, habitId: Id<'habits'>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('stakes', {
      kind: 'lockout',
      userId,
      habitId,
      title: 'Run',
      createdAt: 0,
      status: 'triggered',
      days: 3,
      lostAt: Date.now(),
    });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('contracts', () => {
  test('a habit’s contract comes back on its loss screen', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.contracts.sign, {
      target: { habitId },
      terms: TERMS,
      signature: SIGNATURE,
    });

    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    const stakeId = await lose(t, alice.userId, habitId);

    const contract = await alice.as.query(api.contracts.forLoss, { stakeId });
    expect(contract).toMatchObject({ kind: 'habit', terms: TERMS, signature: SIGNATURE });
    expect(Math.floor(contract?.signedAt ?? 0)).toBe(new Date('2026-09-01T12:00:00Z').getTime());
  });

  test('signing again after a loss doesn’t rewrite the old loss', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.contracts.sign, {
      target: { habitId },
      terms: TERMS,
      signature: SIGNATURE,
    });
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    const stakeId = await lose(t, alice.userId, habitId);

    vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
    await alice.as.mutation(api.contracts.sign, {
      target: { habitId },
      terms: [{ text: 'Restarted terms' }],
      signature: SIGNATURE,
    });

    const contract = await alice.as.query(api.contracts.forLoss, { stakeId });
    expect(contract?.terms).toEqual(TERMS);
  });

  test('a goal’s contract comes back on its Kept screen', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship the app',
      dueAt: new Date('2026-09-25T12:00:00Z').getTime(),
    });
    await alice.as.mutation(api.contracts.sign, {
      target: { goalId },
      terms: TERMS,
      signature: SIGNATURE,
    });

    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
    const accomplishmentId = await t.run(async (ctx) => {
      return await ctx.db.insert('accomplishments', {
        userId: alice.userId,
        kind: 'goal',
        title: 'Ship the app',
        goalId,
        achievedAt: Date.now(),
      });
    });

    const contract = await alice.as.query(api.contracts.forKept, { accomplishmentId });
    expect(contract).toMatchObject({ kind: 'goal', terms: TERMS });
  });

  test('nothing signed, nothing shown', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    const stakeId = await lose(t, alice.userId, habitId);
    expect(await alice.as.query(api.contracts.forLoss, { stakeId })).toBeNull();
  });

  test('nobody else can sign for, or read, a commitment', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });

    await expect(
      bob.as.mutation(api.contracts.sign, {
        target: { habitId },
        terms: TERMS,
        signature: SIGNATURE,
      }),
    ).rejects.toThrow('Habit not found');

    await alice.as.mutation(api.contracts.sign, {
      target: { habitId },
      terms: TERMS,
      signature: SIGNATURE,
    });
    const stakeId = await lose(t, alice.userId, habitId);
    expect(await bob.as.query(api.contracts.forLoss, { stakeId })).toBeNull();
  });

  test('rejects anything that isn’t a signature', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    const sign = (signature: typeof SIGNATURE) =>
      alice.as.mutation(api.contracts.sign, { target: { habitId }, terms: TERMS, signature });

    await expect(sign({ ...SIGNATURE, strokes: ['<script>'] })).rejects.toThrow(
      'Invalid signature',
    );
    await expect(sign({ ...SIGNATURE, strokes: [] })).rejects.toThrow('Invalid signature');
    await expect(sign({ ...SIGNATURE, strokes: ['M1,1 '.repeat(10_000)] })).rejects.toThrow(
      'Invalid signature',
    );
    await expect(
      alice.as.mutation(api.contracts.sign, {
        target: { habitId },
        terms: [{ text: 'x'.repeat(301) }],
        signature: SIGNATURE,
      }),
    ).rejects.toThrow('Contract terms are too long');
  });
});
