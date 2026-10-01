import { describe, expect, test } from 'vitest';

import type { Id } from '../_generated/dataModel';
import {
  goalSlotTimes,
  nextWake,
  owedHabits,
  planReminders,
  selectDue,
  type PlanGoal,
  type PlanHabit,
  type PlanInput,
  type Slot,
} from './reminderPlan';
import { DEFAULT_REMINDER_SETTINGS, type ReminderPreset } from './reminderPresets';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const at = (value: string) => Date.parse(value);
const iso = (value: number) => new Date(value).toISOString();
const settings = (preset: ReminderPreset = 'firm', morningLineup = false) => ({
  ...DEFAULT_REMINDER_SETTINGS,
  preset,
  morningLineup,
});

function habit(fields: Partial<Omit<PlanHabit, 'done'>> & { done?: string[] } = {}): PlanHabit {
  const { done, ...rest } = fields;
  return {
    _id: (rest._id ?? 'habit1') as Id<'habits'>,
    title: 'Run',
    timesPerWeek: 7,
    startDay: '2026-09-20',
    endsAfter: undefined,
    pending: false,
    ...rest,
    done: new Set(done ?? []),
  };
}

function goal(fields: Partial<PlanGoal> = {}): PlanGoal {
  return {
    _id: 'goal1' as Id<'goals'>,
    title: 'Essay',
    dueAt: at('2026-09-25T17:00:00Z'),
    createdAt: at('2026-09-01T12:00:00Z'),
    stakeCents: 2500,
    pending: false,
    ...fields,
  };
}

function input(fields: Partial<PlanInput> = {}): PlanInput {
  return {
    now: at('2026-09-22T08:00:00Z'),
    timeZone: 'UTC',
    accountableFrom: '2026-09-21',
    locked: false,
    settings: settings(),
    goals: [],
    habits: [],
    ...fields,
  };
}

describe('owedHabits', () => {
  test('a daily habit is owed until logged or excused', () => {
    expect(owedHabits([habit()], '2026-09-22', '2026-09-21')).toHaveLength(1);
    expect(owedHabits([habit({ done: ['2026-09-22'] })], '2026-09-22', '2026-09-21')).toEqual([]);
  });

  test('free days owe nothing', () => {
    // The day it was made.
    expect(owedHabits([habit({ startDay: '2026-09-22' })], '2026-09-22', '2026-09-21')).toEqual([]);
    // The day after a re-entry (accountableFrom is tomorrow).
    expect(owedHabits([habit()], '2026-09-22', '2026-09-23')).toEqual([]);
  });

  test('a deleted habit stops once its last day has passed', () => {
    expect(owedHabits([habit({ endsAfter: '2026-09-21' })], '2026-09-22', '2026-09-21')).toEqual(
      [],
    );
    expect(
      owedHabits([habit({ endsAfter: '2026-09-22' })], '2026-09-22', '2026-09-21'),
    ).toHaveLength(1);
  });

  describe('3× a week, made on a Monday, week of Mon 2026-09-21', () => {
    const weekly = (done: string[]) => habit({ timesPerWeek: 3, startDay: '2026-09-14', done });

    test('Friday with one logged still has slack', () => {
      expect(owedHabits([weekly(['2026-09-21'])], '2026-09-25', '2026-09-21')).toEqual([]);
    });

    test('Saturday with one logged has none left', () => {
      expect(owedHabits([weekly(['2026-09-21'])], '2026-09-26', '2026-09-21')).toMatchObject([
        { title: 'Run', weeklyNeeded: 2 },
      ]);
    });

    test('Sunday with none logged is already lost: say nothing', () => {
      expect(owedHabits([weekly([])], '2026-09-27', '2026-09-21')).toEqual([]);
    });

    test('already logged today is fine for today', () => {
      expect(
        owedHabits([weekly(['2026-09-21', '2026-09-26'])], '2026-09-26', '2026-09-21'),
      ).toEqual([]);
    });

    test('a habit made midweek runs its own weeks, from the day it was made', () => {
      // Made Wednesday the 23rd: its week runs to Tuesday the 29th.
      const late = habit({ timesPerWeek: 3, startDay: '2026-09-23' });
      expect(owedHabits([late], '2026-09-26', '2026-09-21')).toEqual([]);
      expect(owedHabits([late], '2026-09-27', '2026-09-21')).toMatchObject([
        { title: 'Run', weeklyNeeded: 3 },
      ]);
    });
  });
});

describe('planReminders', () => {
  test('everything owed tonight is one group, nudged by the preset', () => {
    const plan = planReminders(
      input({ habits: [habit(), habit({ _id: 'habit2' as Id<'habits'>, title: 'Read' })] }),
    );
    const group = plan.groups.get('habits:2026-09-22');
    expect(group).toMatchObject({ kind: 'habits', habits: [{ title: 'Run' }, { title: 'Read' }] });
    expect(plan.slots.map((slot) => [iso(slot.at), slot.final])).toEqual([
      ['2026-09-22T19:00:00.000Z', false],
      ['2026-09-22T22:30:00.000Z', true],
    ]);
  });

  test('after midnight the day is still open till 3 AM, with no nudges left in it', () => {
    const now = at('2026-09-23T01:00:00Z');
    const plan = planReminders(input({ now, habits: [habit()] }));
    expect(plan.groups.get('habits:2026-09-22')).toMatchObject({
      deadline: at('2026-09-23T03:00:00Z'),
    });
    expect(plan.slots.every((slot) => slot.at < now)).toBe(true);
    expect(iso(nextWake(plan, now, now)!)).toBe('2026-09-23T03:01:00.000Z');
  });

  test('each preset times habits differently', () => {
    const times = (preset: ReminderPreset) =>
      planReminders(input({ habits: [habit()], settings: settings(preset) })).slots.map((slot) =>
        iso(slot.at).slice(11, 16),
      );
    expect(times('gentle')).toEqual(['21:00']);
    expect(times('firm')).toEqual(['19:00', '22:30']);
    expect(times('relentless')).toEqual(['14:00', '19:00', '22:00', '23:15']);
  });

  test('no habit reminders while locked, or without a zone; goals keep going', () => {
    const locked = planReminders(input({ locked: true, habits: [habit()], goals: [goal()] }));
    expect([...locked.groups.keys()]).toEqual([`goals:${goal().dueAt}`]);

    const noZone = planReminders(input({ timeZone: undefined, habits: [habit()] }));
    expect(noZone.groups.size).toBe(0);
  });

  test('goals due at the same moment share a push', () => {
    const plan = planReminders(
      input({ goals: [goal(), goal({ _id: 'goal2' as Id<'goals'>, title: 'Taxes' })] }),
    );
    expect(plan.groups.size).toBe(1);
    expect(plan.groups.get(`goals:${goal().dueAt}`)).toMatchObject({
      goals: [{ title: 'Essay' }, { title: 'Taxes' }],
    });
  });

  test('the morning lineup only when something is due today', () => {
    const withHabit = planReminders(input({ habits: [habit()], settings: settings('firm', true) }));
    expect(withHabit.slots.find((slot) => slot.group === 'lineup:2026-09-22')?.at).toBe(
      at('2026-09-22T08:30:00Z'),
    );

    const nothing = planReminders(input({ goals: [goal()], settings: settings('firm', true) }));
    expect(nothing.groups.has('lineup:2026-09-22')).toBe(false);
  });
});

describe('goalSlotTimes', () => {
  const due = at('2026-09-25T17:00:00Z');
  const created = at('2026-09-01T12:00:00Z');
  const times = (slots: { at: number; final: boolean }[]) =>
    slots.map((slot) => [iso(slot.at), slot.final]);

  test('firm: a day before, 5 hours, then a last call', () => {
    expect(times(goalSlotTimes(due, created, settings('firm'), 'UTC'))).toEqual([
      ['2026-09-24T17:00:00.000Z', false],
      ['2026-09-25T12:00:00.000Z', false],
      ['2026-09-25T15:30:00.000Z', true],
    ]);
  });

  test('offsets from before the goal existed are skipped', () => {
    const lateStart = at('2026-09-25T10:00:00Z');
    expect(times(goalSlotTimes(due, lateStart, settings('firm'), 'UTC'))).toEqual([
      ['2026-09-25T12:00:00.000Z', false],
      ['2026-09-25T15:30:00.000Z', true],
    ]);
  });

  test('a short-notice goal still gets one last call, halfway', () => {
    expect(times(goalSlotTimes(due, due - 80 * MINUTE, settings('firm'), 'UTC'))).toEqual([
      ['2026-09-25T16:20:00.000Z', true],
    ]);
    // Too little lead to be worth a push at all.
    expect(goalSlotTimes(due, due - 20 * MINUTE, settings('firm'), 'UTC')).toEqual([]);
  });

  test('early nudges leave the night; the last call never moves', () => {
    // Due 7 AM Chicago (12:00Z) on the 23rd.
    const early = at('2026-09-23T12:00:00Z');
    expect(times(goalSlotTimes(early, created, settings('firm'), 'America/Chicago'))).toEqual([
      // 24h before is 7 AM: moved to 8 AM.
      ['2026-09-22T13:00:00.000Z', false],
      // 5h before is 2 AM, and 8 AM is past the deadline: the evening before.
      ['2026-09-23T02:30:00.000Z', false],
      // 90 min before, 5:30 AM: the final stays put.
      ['2026-09-23T10:30:00.000Z', true],
    ]);
  });

  test('nudges pushed onto the same slot collapse into one', () => {
    // Due 9:40 AM Chicago (14:40Z). Relentless's 5h (4:40 AM) and 2h (7:40 AM)
    // both move to 8 AM; only one of them survives.
    const due940 = at('2026-09-23T14:40:00Z');
    const slots = goalSlotTimes(due940, created, settings('relentless'), 'America/Chicago');
    expect(slots.filter((slot) => slot.at === at('2026-09-23T13:00:00Z'))).toHaveLength(1);
    expect(times(slots)).toEqual([
      ['2026-09-20T14:40:00.000Z', false],
      ['2026-09-22T14:40:00.000Z', false],
      ['2026-09-23T04:40:00.000Z', false],
      ['2026-09-23T13:00:00.000Z', false],
      ['2026-09-23T13:55:00.000Z', true],
    ]);
  });
});

describe('selectDue', () => {
  const slot = (fields: Partial<Slot>): Slot => ({
    at: at('2026-09-22T19:00:00Z'),
    group: 'habits:2026-09-22',
    deadline: at('2026-09-23T00:00:00Z'),
    final: false,
    ...fields,
  });
  const state = { sentThrough: at('2026-09-22T12:00:00Z'), sentToday: 0 };

  test('only the latest slot per group; a delayed run fires no backlog', () => {
    const slots = [slot({}), slot({ at: at('2026-09-22T22:30:00Z'), final: true })];
    const { due, sentThrough } = selectDue(
      slots,
      state,
      at('2026-09-22T22:31:00Z'),
      '2026-09-22',
      6,
    );
    expect(due).toEqual([slots[1]]);
    expect(sentThrough).toBe(at('2026-09-22T22:31:00Z'));
  });

  test('stale early nudges are dropped; finals go while the deadline is ahead', () => {
    const early = selectDue([slot({})], state, at('2026-09-22T19:45:00Z'), '2026-09-22', 6);
    expect(early.due).toEqual([]);
    const final = slot({ at: at('2026-09-22T22:30:00Z'), final: true });
    expect(selectDue([final], state, at('2026-09-22T23:50:00Z'), '2026-09-22', 6).due).toEqual([
      final,
    ]);
    expect(selectDue([final], state, at('2026-09-23T00:01:00Z'), '2026-09-22', 6).due).toEqual([]);
  });

  test('slots a few minutes ahead come along now', () => {
    const soon = slot({ at: at('2026-09-22T19:08:00Z') });
    const result = selectDue([soon], state, at('2026-09-22T19:00:00Z'), '2026-09-22', 6);
    expect(result.due).toEqual([soon]);
    expect(result.sentThrough).toBe(soon.at);
  });

  test('the daily cap and the gap hold back early nudges only', () => {
    const now = at('2026-09-22T19:00:00Z');
    const capped = { ...state, day: '2026-09-22', sentToday: 6 };
    expect(selectDue([slot({})], capped, now, '2026-09-22', 6).due).toEqual([]);
    // A new day resets the count.
    expect(selectDue([slot({})], capped, now, '2026-09-23', 6).due).toHaveLength(1);

    const recent = { ...state, lastPushAt: now - 10 * MINUTE };
    expect(selectDue([slot({})], recent, now, '2026-09-22', 6).due).toEqual([]);
    const final = slot({ final: true });
    expect(selectDue([final], recent, now, '2026-09-22', 6).due).toEqual([final]);
  });
});

describe('nextWake', () => {
  test('the next slot, or just after the day ends at 3 AM to plan a new one', () => {
    const now = at('2026-09-22T08:00:00Z');
    const plan = planReminders(input({ now, habits: [habit()] }));
    expect(iso(nextWake(plan, now, now)!)).toBe('2026-09-22T19:00:00.000Z');
    expect(iso(nextWake(plan, at('2026-09-22T22:30:00Z'), now)!)).toBe('2026-09-23T03:01:00.000Z');
  });

  test('a goal days away is re-planned daily; nothing open means no wake', () => {
    const now = at('2026-09-01T13:00:00Z');
    const plan = planReminders(input({ now, goals: [goal()] }));
    expect(nextWake(plan, now, now)).toBe(now + 24 * HOUR);
    expect(nextWake(planReminders(input({ now })), now, now)).toBeNull();
  });
});
