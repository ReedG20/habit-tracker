import { describe, expect, test } from 'vitest';

import type { GoalWithStatus } from './goals';
import { pastCommitments, type EndedHabitView } from './past-commitments';

import type { Id } from '@/convex/_generated/dataModel';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 1, 12);

let nextId = 0;
function goal(fields: Partial<GoalWithStatus>): GoalWithStatus {
  nextId += 1;
  return {
    _id: `goal${nextId}` as Id<'goals'>,
    _creationTime: 0,
    userId: 'user' as Id<'users'>,
    title: `Goal ${nextId}`,
    order: nextId,
    dueAt: NOW + HOUR,
    submission: null,
    stakeView: null,
    ...fields,
  };
}

function ended(fields: Partial<EndedHabitView>): EndedHabitView {
  nextId += 1;
  return {
    _id: `ended${nextId}` as Id<'endedHabits'>,
    title: `Habit ${nextId}`,
    outcome: 'ended',
    completions: 1,
    startedAt: 0,
    endedAt: NOW - HOUR,
    ...fields,
  };
}

describe('pastCommitments', () => {
  test('leaves out goals still running', () => {
    expect(pastCommitments([goal({})], [], NOW)).toEqual([]);
  });

  test('takes done and missed goals, and deleted habits, newest first', () => {
    const done = goal({ completedAt: NOW - 3 * HOUR, dueAt: NOW + HOUR });
    const missed = goal({ dueAt: NOW - 2 * HOUR });
    const habit = ended({ endedAt: NOW - HOUR });
    const older = ended({ endedAt: NOW - 10 * HOUR });

    expect(pastCommitments([done, missed], [older, habit], NOW)).toEqual([
      { kind: 'habit', habit, endedAt: NOW - HOUR },
      { kind: 'goal', goal: missed, endedAt: NOW - 2 * HOUR },
      { kind: 'goal', goal: done, endedAt: NOW - 3 * HOUR },
      { kind: 'habit', habit: older, endedAt: NOW - 10 * HOUR },
    ]);
  });

  test('a goal joins the moment its deadline passes', () => {
    const due = goal({ dueAt: NOW });
    expect(pastCommitments([due], [], NOW - 1)).toEqual([]);
    expect(pastCommitments([due], [], NOW)).toHaveLength(1);
  });
});
