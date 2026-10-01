import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { limitMessage, MAX_ACTIVE_HABITS, MAX_OPEN_GOALS } from './lib/commitmentLimits';
import { setup as baseSetup, signIn, type Harness } from './test.helpers';

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

const NOW = Date.UTC(2026, 8, 30, 12);
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv('STAKES_V2', 'on');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('commitment limits', () => {
  test('habits stop at the cap', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    for (let i = 0; i < MAX_ACTIVE_HABITS; i++) {
      await alice.as.mutation(api.habits.create, {
        title: `Habit ${i}`,
        stake: { kind: 'lockout', days: 3 },
      });
    }

    await expect(
      alice.as.mutation(api.habits.create, { title: 'One more', stake: { kind: 'none' } }),
    ).rejects.toThrow(limitMessage('habit'));
    await expect(
      t.mutation(internal.habits.insertStaked, {
        userId: alice.userId,
        title: 'One more',
        amountCents: 1000,
        stripeCustomerId: 'cus_test',
        stripePaymentMethodId: 'pm_test',
        stripeSetupIntentId: 'seti_more',
      }),
    ).rejects.toThrow(limitMessage('habit'));

    // Goals have their own room.
    await alice.as.mutation(api.goals.create, { title: 'Ship it', dueAt: NOW + DAY_MS });

    expect(await alice.as.query(api.limits.room, { now: NOW })).toEqual({
      habits: { used: MAX_ACTIVE_HABITS, max: MAX_ACTIVE_HABITS },
      goals: { used: 1, max: MAX_OPEN_GOALS },
    });
  });

  test('only active habits count: broken and ending ones make room until brought back', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const ids: Id<'habits'>[] = [];
    for (let i = 0; i < MAX_ACTIVE_HABITS; i++) {
      ids.push(
        await alice.as.mutation(api.habits.create, {
          title: `Habit ${i}`,
          stake: { kind: 'none' },
        }),
      );
    }

    // One breaks, one is ending: two slots open up.
    await t.run(async (ctx) => {
      await ctx.db.patch('habits', ids[0]!, { brokenAt: NOW, stakeId: undefined });
      await ctx.db.patch('habits', ids[1]!, { endsAfter: '2026-10-07' });
    });
    expect((await alice.as.query(api.limits.room, { now: NOW })).habits.used).toBe(
      MAX_ACTIVE_HABITS - 2,
    );
    await alice.as.mutation(api.habits.create, { title: 'New one', stake: { kind: 'none' } });
    await alice.as.mutation(api.habits.create, { title: 'And another', stake: { kind: 'none' } });

    // Full again, so neither can come back.
    await expect(
      alice.as.mutation(api.habits.restart, { habitId: ids[0]!, stake: { kind: 'none' } }),
    ).rejects.toThrow(limitMessage('habit'));
    await expect(alice.as.mutation(api.habits.keepGoing, { habitId: ids[1]! })).rejects.toThrow(
      limitMessage('habit'),
    );

    // With a slot free, the broken one restarts.
    await alice.as.mutation(api.habits.remove, { habitId: ids[2]! });
    await alice.as.mutation(api.habits.restart, { habitId: ids[0]!, stake: { kind: 'none' } });
  });

  test('a habit deleted outright frees its slot', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    let last;
    for (let i = 0; i < MAX_ACTIVE_HABITS; i++) {
      last = await alice.as.mutation(api.habits.create, {
        title: `Habit ${i}`,
        stake: { kind: 'none' },
      });
    }
    expect(await alice.as.mutation(api.habits.remove, { habitId: last! })).toBe('deleted');
    await alice.as.mutation(api.habits.create, { title: 'Swap', stake: { kind: 'none' } });
  });

  test('only open goals count: proven and past-due ones make room', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const ids: Id<'goals'>[] = [];
    for (let i = 0; i < MAX_OPEN_GOALS; i++) {
      ids.push(
        await alice.as.mutation(api.goals.create, {
          title: `Goal ${i}`,
          dueAt: NOW + (i + 1) * DAY_MS,
        }),
      );
    }

    await expect(
      alice.as.mutation(api.goals.create, { title: 'One more', dueAt: NOW + DAY_MS }),
    ).rejects.toThrow(limitMessage('goal'));

    await t.run(async (ctx) => {
      await ctx.db.patch('goals', ids[1]!, { completedAt: NOW });
    });
    await alice.as.mutation(api.goals.create, { title: 'One more', dueAt: NOW + 2 * DAY_MS });
    await expect(
      alice.as.mutation(api.goals.create, { title: 'Another', dueAt: NOW + 2 * DAY_MS }),
    ).rejects.toThrow(limitMessage('goal'));

    // The first goal's deadline passes, unproven.
    vi.setSystemTime(NOW + DAY_MS + 1);
    await alice.as.mutation(api.goals.create, { title: 'Another', dueAt: NOW + 3 * DAY_MS });

    expect(await alice.as.query(api.limits.room, { now: NOW + DAY_MS + 1 })).toEqual({
      habits: { used: 0, max: MAX_ACTIVE_HABITS },
      goals: { used: MAX_OPEN_GOALS, max: MAX_OPEN_GOALS },
    });
  });

  test('one user’s commitments don’t count against another’s', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const bob = await signIn(t, 'bob');
    for (let i = 0; i < MAX_ACTIVE_HABITS; i++) {
      await alice.as.mutation(api.habits.create, { title: `Habit ${i}`, stake: { kind: 'none' } });
    }
    await bob.as.mutation(api.habits.create, { title: 'Run', stake: { kind: 'none' } });
  });
});

describe('friend heads-ups', () => {
  test('over the daily limit, the commitment is refused instead of the email dropped', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const friend = { name: 'Sam', email: 'sam@example.com' };

    // Proving each goal before the next stays under the cap, not the email limit.
    for (let i = 0; i < 10; i++) {
      const goalId = await alice.as.mutation(api.goals.create, {
        title: `Goal ${i}`,
        dueAt: NOW + DAY_MS,
        stake: { kind: 'friend', friend },
      });
      await t.run(async (ctx) => {
        await ctx.db.patch('goals', goalId, { completedAt: NOW });
      });
    }

    await expect(
      alice.as.mutation(api.goals.create, {
        title: 'One more',
        dueAt: NOW + DAY_MS,
        stake: { kind: 'friend', friend },
      }),
    ).rejects.toThrow('friends emailed for one day');
    const goals = await alice.as.query(api.goals.list, {});
    expect(goals).toHaveLength(10);
  });
});
