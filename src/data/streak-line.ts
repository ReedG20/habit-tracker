import {
  isMilestone,
  nextMilestone,
  streakLabel,
  type MilestoneUnit,
} from '@/convex/lib/milestones';

/**
 * The line under an approved proof: the run it just added to, and how far to
 * the next milestone. `null` for a run too short to be worth a line yet.
 */
export function streakLine(count: number, unit: MilestoneUnit): string | null {
  if (count < 2) return null;
  const run = `${streakLabel(count, unit)} in a row`;
  if (isMilestone(count, unit)) return `${run}. That’s a milestone.`;
  const next = nextMilestone(count, unit);
  if (next === null) return `${run}.`;
  return `${run} · ${streakLabel(next - count, unit)} to ${next}`;
}
