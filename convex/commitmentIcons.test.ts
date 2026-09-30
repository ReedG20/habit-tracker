import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { setup, signIn, type Harness } from './test.helpers';

const generateText = vi.hoisted(() => vi.fn());
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText,
}));

const inAnHour = () => Date.now() + 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  generateText.mockReset();
  vi.useRealTimers();
});

async function habitIcon(t: Harness, habitId: Id<'habits'>) {
  return await t.run(async (ctx) => {
    const habit = await ctx.db.get('habits', habitId);
    return { icon: habit?.icon, iconChosen: habit?.iconChosen };
  });
}

describe('creating with an icon', () => {
  test('stores the icon, and whether the user chose it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const picked = await alice.as.mutation(api.habits.create, { title: 'Run', icon: 'run' });
    const chosen = await alice.as.mutation(api.habits.create, {
      title: 'Read',
      icon: 'open-book',
      iconChosen: true,
    });
    expect(await habitIcon(t, picked)).toEqual({ icon: 'run', iconChosen: undefined });
    expect(await habitIcon(t, chosen)).toEqual({ icon: 'open-book', iconChosen: true });

    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship it',
      dueAt: inAnHour(),
      icon: 'rocket',
    });
    expect(await alice.as.query(api.goals.get, { goalId })).toMatchObject({ icon: 'rocket' });
  });

  test('refuses a key the app does not know', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await expect(
      alice.as.mutation(api.habits.create, { title: 'Run', icon: 'unicorn' }),
    ).rejects.toThrow('Pick one of the icons offered');
    await expect(
      alice.as.mutation(api.goals.create, { title: 'Ship', dueAt: inAnHour(), icon: 'unicorn' }),
    ).rejects.toThrow('Pick one of the icons offered');
  });
});

describe('editing', () => {
  test('a rename picks a new icon unless the user chose one', async () => {
    generateText.mockResolvedValue({ output: { icon: 'swim' } });
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run', icon: 'run' });

    await alice.as.mutation(api.habits.update, { habitId, title: 'Swim laps' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await habitIcon(t, habitId)).toEqual({ icon: 'swim', iconChosen: undefined });

    // Picked by hand: it sticks, and the next rename asks nothing.
    await alice.as.mutation(api.habits.update, { habitId, icon: 'water' });
    await alice.as.mutation(api.habits.update, { habitId, title: 'Go for a run' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await habitIcon(t, habitId)).toEqual({ icon: 'water', iconChosen: true });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  test('an edit that keeps the name keeps the icon', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship it',
      dueAt: inAnHour(),
      icon: 'rocket',
    });
    await alice.as.mutation(api.goals.update, { goalId, title: 'Ship it', description: 'Live' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(generateText).not.toHaveBeenCalled();
  });

  test('refuses an unknown icon', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await expect(alice.as.mutation(api.habits.update, { habitId, icon: 'nope' })).rejects.toThrow(
      'Pick one of the icons offered',
    );
  });
});

describe('setIcon', () => {
  test('never overwrites a chosen icon, or one picked for an older name', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const chosen = await alice.as.mutation(api.habits.create, {
      title: 'Run',
      icon: 'run',
      iconChosen: true,
    });
    const renamed = await alice.as.mutation(api.habits.create, { title: 'Swim', icon: 'swim' });

    await t.mutation(internal.commitmentIcons.setIcon, {
      target: { kind: 'habit', id: chosen },
      icon: 'walk',
      title: 'Run',
    });
    await t.mutation(internal.commitmentIcons.setIcon, {
      target: { kind: 'habit', id: renamed },
      icon: 'run',
      title: 'Run',
    });
    expect((await habitIcon(t, chosen)).icon).toBe('run');
    expect((await habitIcon(t, renamed)).icon).toBe('swim');
  });
});

describe('backfill', () => {
  test('gives icons to old habits and goals without touching existing ones', async () => {
    generateText.mockImplementation(({ messages }: { messages: { content: string }[] }) =>
      Promise.resolve({
        output: { icon: messages[0]?.content.includes('Type: goal') ? 'flag' : 'book' },
      }),
    );
    const t = setup();
    const alice = await signIn(t, 'alice');
    const old = await alice.as.mutation(api.habits.create, { title: 'Read' });
    const current = await alice.as.mutation(api.habits.create, { title: 'Run', icon: 'run' });
    const goalId = await alice.as.mutation(api.goals.create, {
      title: 'Ship it',
      dueAt: inAnHour(),
    });

    await t.action(internal.commitmentIcons.backfill, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await habitIcon(t, old)).icon).toBe('book');
    expect((await habitIcon(t, current)).icon).toBe('run');
    expect(await alice.as.query(api.goals.get, { goalId })).toMatchObject({ icon: 'flag' });
    // Only the two without icons were asked about.
    expect(generateText).toHaveBeenCalledTimes(2);
  });
});
