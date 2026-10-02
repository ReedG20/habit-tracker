import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { grantPro, setup, type Harness } from './test.helpers';

// 2026-09-21 is a Monday. Everyone here lives in UTC.
const at = (value: string) => Date.parse(value);
const TOKEN = 'ExponentPushToken[alice-phone]';

type Sent = { title: string; body: string; data: { kind: string; url: string } };

let sent: Sent[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21T12:00:00Z'));
  vi.stubEnv('PUSH_DELIVERY', 'on');
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/push/send')) {
        const batch = JSON.parse(String(init?.body)) as Sent[];
        sent.push(...batch);
        const data = batch.map((_, index) => ({ status: 'ok', id: `ticket-${index}` }));
        return new Response(JSON.stringify({ data }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signIn(t: Harness, name: string) {
  const as = t.withIdentity({ tokenIdentifier: name, name });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  await as.mutation(api.push.register, { token: TOKEN, permission: 'granted' });
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

const comebacks = () => sent.filter((push) => push.data.kind === 'comeback');

describe('comeback nudges', () => {
  test('1, 3 and 7 days after the last one ends, mid-morning, then nothing', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.habits.remove, { habitId });

    await runUntil(t, '2026-09-22T09:59:00Z');
    expect(comebacks()).toEqual([]);

    await runUntil(t, '2026-09-22T10:01:00Z');
    expect(comebacks()).toMatchObject([
      { title: 'Nothing on the line', body: 'Run is over. What’s the next one?' },
    ]);
    expect(comebacks()[0]?.data.url).toBe('/new');

    await runUntil(t, '2026-10-30T00:00:00Z');
    expect(comebacks().map((push) => push.title)).toEqual([
      'Nothing on the line',
      'Nothing on the line',
      'Still in?',
    ]);
  });

  test('stop as soon as something is running again', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.habits.remove, { habitId });

    await runUntil(t, '2026-09-22T12:00:00Z');
    expect(comebacks()).toHaveLength(1);

    await alice.as.mutation(api.habits.create, { title: 'Read' });
    await runUntil(t, '2026-10-30T00:00:00Z');
    expect(comebacks()).toHaveLength(1);
  });

  test('none with the setting off', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.reminders.updateSettings, { comebacks: false });
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.habits.remove, { habitId });

    await runUntil(t, '2026-10-30T00:00:00Z');
    expect(comebacks()).toEqual([]);
  });

  test('a goal on just their word that lapses starts them, from its deadline', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.goals.create, {
      title: 'Ship the app',
      dueAt: at('2026-09-25T21:00:00Z'),
    });

    await runUntil(t, '2026-09-26T09:00:00Z');
    expect(comebacks()).toEqual([]);

    await runUntil(t, '2026-09-26T10:01:00Z');
    expect(comebacks()).toMatchObject([
      {
        title: 'Go again?',
        body: 'Ship the app got away. One miss isn’t the story. Set it again?',
      },
    ]);
  });

  test('wait for the last open goal, however many habits ended before it', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    await alice.as.mutation(api.goals.create, {
      title: 'Ship the app',
      dueAt: at('2026-10-05T21:00:00Z'),
    });
    const habitId = await alice.as.mutation(api.habits.create, { title: 'Run' });
    await alice.as.mutation(api.habits.remove, { habitId });

    await runUntil(t, '2026-10-06T09:00:00Z');
    expect(comebacks()).toEqual([]);
    await runUntil(t, '2026-10-06T10:01:00Z');
    expect(comebacks()).toMatchObject([{ title: 'Go again?' }]);
  });
});
