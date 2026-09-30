import type { FunctionReturnType } from 'convex/server';

import type { api } from '@/convex/_generated/api';
import { heldStake } from '@/convex/lib/stakeLadder';

/**
 * The Today card that offers to put money on the commitment made during
 * onboarding, which couldn't take a card. It runs for the first week, roughly
 * the trial, and a dismissal is for good. Pure, so every branch is tested.
 */

export type RaiseNudgeCandidate = NonNullable<
  FunctionReturnType<typeof api.raises.firstCommitment>
>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long after onboarding the card keeps showing. */
export const RAISE_NUDGE_WINDOW_MS = 7 * DAY_MS;

/** The server refuses a raise closer to a goal's deadline than this. */
const MIN_LEAD_MS = 60 * 1000;

export type RaiseNudgeInput = {
  candidate: RaiseNudgeCandidate | null | undefined;
  isPro: boolean;
  dismissed: boolean;
  now: number;
};

export function shouldShowRaiseNudge({
  candidate,
  isPro,
  dismissed,
  now,
}: RaiseNudgeInput): boolean {
  if (candidate == null || !isPro || dismissed) return false;
  if (now - candidate.onboardedAt >= RAISE_NUDGE_WINDOW_MS) return false;
  return candidate.dueAt === undefined || candidate.dueAt >= now + MIN_LEAD_MS;
}

export type RaiseNudgeCopy = { title: string; body: string; action: string };

export function raiseNudgeCopy(candidate: RaiseNudgeCandidate): RaiseNudgeCopy {
  const friend = heldStake(candidate.stake);
  const offHook =
    friend?.kind === 'friend' ? ` ${friend.friendName}’s off the hook if you do.` : '';
  return {
    title: 'Ready to put money on it?',
    body: `Onboarding couldn’t take a card. Now it can: put money on “${candidate.title}” and a miss costs you.${offHook}`,
    action: 'Up the ante',
  };
}
