import { describe, expect, test } from 'vitest';

import type { HabitWithProgress } from './habits';
import { groupIntoHomeSections } from './home-sections';

import type { Id } from '@/convex/_generated/dataModel';

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
  test('is urgent once skipping today would end the week short', () => {
    expect(sectionOf(habit({ timesPerWeek: 3, weekCount: 1 }))).toBe('urgent');
  });

  test('stays in the list while there is slack', () => {
    expect(sectionOf(habit({ timesPerWeek: 3, weekCount: 2 }))).toBe('habits');
    expect(sectionOf(habit({ timesPerWeek: 3, weekCount: 0 }), '2026-09-22')).toBe('habits');
  });

  test('is done for the week once the target is met, even on a day not logged', () => {
    const done = habit({ timesPerWeek: 3, weekCount: 3 });
    const [section] = groupIntoHomeSections([habit({}), done], [], SATURDAY, 0);
    expect(section.id).toBe('habits');
    // Sinks below what still needs doing.
    expect(section.items.at(-1)).toMatchObject({ kind: 'habit', habit: { _id: done._id } });
  });

  test('is not urgent once logged today, even while still short', () => {
    expect(sectionOf(habit({ timesPerWeek: 3, weekCount: 1, completedToday: true }))).toBe(
      'habits',
    );
  });

  test('a rejected photo is still urgent', () => {
    expect(
      sectionOf(habit({ timesPerWeek: 3, weekCount: 2, verification: { status: 'rejected' } })),
    ).toBe('urgent');
  });
});

describe('groupIntoHomeSections, daily habits', () => {
  test('are never urgent just for being unlogged', () => {
    expect(sectionOf(habit({}))).toBe('habits');
    expect(sectionOf(habit({ timesPerWeek: 7 }))).toBe('habits');
  });
});
