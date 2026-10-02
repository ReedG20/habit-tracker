// No imports from `_generated`, so the app bundle can import this file too.

/**
 * The streak lengths worth stopping to mark: a full-screen moment when one is
 * reached (`milestones.ts`), the Today hero's countdown to the next, and the
 * share card's kicker. Days for a daily habit, weeks for the rest, the same
 * unit its streak is counted in.
 */

export type MilestoneUnit = 'day' | 'week';

export const MILESTONES: Record<MilestoneUnit, readonly number[]> = {
  day: [7, 14, 30, 50, 100, 365],
  week: [4, 8, 12, 26, 52],
};

export function isMilestone(count: number, unit: MilestoneUnit): boolean {
  return MILESTONES[unit].includes(count);
}

/** The next one past `count`, or null once they've all been reached. */
export function nextMilestone(count: number, unit: MilestoneUnit): number | null {
  return MILESTONES[unit].find((milestone) => milestone > count) ?? null;
}

/** "7 days", "1 week". */
export function streakLabel(count: number, unit: MilestoneUnit): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
