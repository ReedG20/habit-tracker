import { describe, expect, test } from 'vitest';

import type { GoalWithStatus } from './goals';
import type { HabitWithProgress } from './habits';
import { groupIntoHomeSections } from './home-sections';

import type { Id } from '@/convex/_generated/dataModel';
import { endOfDay } from '@/lib/dates';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// A Saturday: two days left in the week, today included.
const SATURDAY = '2026-09-26';

let nextId = 0;
function habit(fields: Partial<HabitWithProgress>): HabitWithProgress {
  nextId += 1;
  return {
    _id: `habit${nextId}` as Id<'habits'>,
    _creationTime: 0,
    userId: 'user' as Id<'users'>,
    title: `Habit ${nextId}`,
    order: nextId,
    completedToday: false,
    weekCount: 0,
    streak: 0,
    verification: null,
    stakeView: null,
    ...fields,
  };
}

function goal(fields: Partial<GoalWithStatus>): GoalWithStatus {
  nextId += 1;
  return {
    _id: `goal${nextId}` as Id<'goals'>,
    _creationTime: 0,
    userId: 'user' as Id<'users'>,
    title: `Goal ${nextId}`,
    order: nextId,
    dueAt: 0,
    submission: null,
    stakeView: null,
    ...fields,
  };
}

function sectionOf(item: HabitWithProgress, today = SATURDAY) {
  const sections = groupIntoHomeSections([item], [], today, 0);
  const section = sections.find((candidate) =>
    candidate.items.some((entry) => entry.kind === 'habit' && entry.habit._id === item._id),
  );
  return section?.id;
}

describe('groupIntoHomeSections, weekly habits', () => {
  test('is due today once skipping today would end the week short', () => {
    expect(sectionOf(habit({ timesPerWeek: 3, weekCount: 1 }))).toBe('today');
  });

  test('is coming up while there is slack', () => {
    expect(sectionOf(habit({ timesPerWeek: 3, weekCount: 2 }))).toBe('upcoming');
    expect(sectionOf(habit({ timesPerWeek: 3, weekCount: 0 }), '2026-09-22')).toBe('upcoming');
  });

  test('is done for the week once the target is met, even on a day not logged', () => {
    expect(sectionOf(habit({ timesPerWeek: 3, weekCount: 3 }))).toBe('done');
  });

  test('is done once logged today, even while still short', () => {
    expect(sectionOf(habit({ timesPerWeek: 3, weekCount: 1, completedToday: true }))).toBe('done');
  });

  test('a rejected photo is due today, ahead of everything else', () => {
    const setback = habit({ timesPerWeek: 3, weekCount: 2, verification: { status: 'rejected' } });
    expect(sectionOf(setback)).toBe('today');
    const [section] = groupIntoHomeSections([habit({}), setback], [], SATURDAY, 0);
    expect(section.items[0]).toMatchObject({ kind: 'habit', habit: { _id: setback._id } });
  });
});

describe('groupIntoHomeSections, daily habits', () => {
  test('are due today until logged', () => {
    expect(sectionOf(habit({}))).toBe('today');
    expect(sectionOf(habit({ timesPerWeek: 7 }))).toBe('today');
  });

  test('only urgent ones count down', () => {
    const [section] = groupIntoHomeSections([habit({})], [], SATURDAY, 0);
    expect(section.items[0]).not.toHaveProperty('deadlineAt');
  });

  test('are done once logged, and while their proof is checked', () => {
    expect(sectionOf(habit({ completedToday: true }))).toBe('done');
    expect(sectionOf(habit({ verification: { status: 'pending' } }))).toBe('done');
  });
});

describe('groupIntoHomeSections, goals', () => {
  const midnight = endOfDay(SATURDAY);
  const morning = midnight - 14 * HOUR;

  function sectionOfGoal(item: GoalWithStatus) {
    return groupIntoHomeSections([], [item], SATURDAY, morning).find((section) =>
      section.items.some((entry) => entry.kind === 'goal' && entry.goal._id === item._id),
    )?.id;
  }

  test("due before midnight is today, and sorts above tonight's habits", () => {
    const soon = goal({ dueAt: midnight - 6 * HOUR });
    expect(sectionOfGoal(soon)).toBe('today');
    const [section] = groupIntoHomeSections([habit({})], [soon], SATURDAY, morning);
    expect(section.items[0]).toMatchObject({ kind: 'goal' });
  });

  test('due after midnight is coming up, soonest first', () => {
    const later = goal({ dueAt: midnight + 3 * DAY });
    expect(sectionOfGoal(later)).toBe('upcoming');
  });

  test('missed goals are listed last', () => {
    const missed = goal({ dueAt: morning - HOUR });
    const sections = groupIntoHomeSections([habit({})], [missed], SATURDAY, morning);
    expect(sections.at(-1)?.id).toBe('missed');
  });

  test('completed goals stay on Commitments', () => {
    expect(sectionOfGoal(goal({ completedAt: morning, dueAt: midnight }))).toBeUndefined();
  });

  test('a submitted goal waits in done', () => {
    expect(sectionOfGoal(goal({ dueAt: midnight, submission: { status: 'pending' } }))).toBe(
      'done',
    );
  });
});
