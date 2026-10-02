import type { CommitmentDraft, CommitmentKind } from '@/components/commitment/draft';
import {
  friendHeadsUpAt,
  goalCallOffUntil,
  habitCallOffUntil,
  isCallOffOpen,
} from '@/convex/lib/callOff';
import { isStakeLive, type StakeView } from '@/convex/lib/stakeRules';
import { describeClock } from '@/lib/dates';

/**
 * A new commitment can be called off, or its terms changed, for a short while
 * after it's signed (`convex/lib/callOff.ts`). Said plainly and with a time,
 * so it reads as fair rather than as a loophole, and never as "free".
 */

/** The device's zone, which the server also stores for the user. */
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * When the commitment the draft would make could still be called off, if it
 * were signed `now`. `carried` is the window of one it replaces, which it
 * never outlasts. The server sets the real one; this is for saying it first.
 */
export function draftCallOffUntil(draft: CommitmentDraft, now: number, carried?: number): number {
  const fresh =
    draft.kind === 'goal'
      ? goalCallOffUntil(now, draft.dueAt)
      : habitCallOffUntil(now, deviceTimeZone());
  return carried === undefined ? fresh : Math.min(fresh, carried);
}

/**
 * When the friend on the draft's stake will be emailed, given its call-off
 * window: the same rule the server schedules by (`friendHeadsUpAt`), so the
 * time on screen is the time it goes.
 */
export function draftHeadsUpAt(draft: CommitmentDraft, callOffUntil: number, now: number): number {
  return friendHeadsUpAt(
    callOffUntil,
    now,
    deviceTimeZone(),
    draft.kind === 'goal' ? draft.dueAt : undefined,
  );
}

/** "at 2:15 PM", "tomorrow at 8:00 AM", "on Wed 8:00 AM": when a heads-up goes, mid-sentence. */
export function headsUpWhen(at: number, now: number): string {
  const clock = describeClock(at, now);
  if (clock.startsWith('tomorrow ')) return `tomorrow at ${clock.slice('tomorrow '.length)}`;
  return /^\d/.test(clock) ? `at ${clock}` : `on ${clock}`;
}

/**
 * When an open commitment can still be called off, or `null`. Only worth
 * offering while something is on the line: their word alone can go any time.
 */
export function openCallOff(
  commitment: { callOffUntil?: number; completedAt?: number; endsAfter?: string },
  stake: StakeView | null,
  now: number,
): number | null {
  const { callOffUntil } = commitment;
  if (callOffUntil === undefined || !isCallOffOpen(callOffUntil, now)) return null;
  if (commitment.completedAt !== undefined || commitment.endsAfter !== undefined) return null;
  if (stake === null || !isStakeLive(stake)) return null;
  return callOffUntil;
}

export const CALL_OFF_HEADING = 'Second thoughts?';

/** The detail banner: until when, and what happens after. */
export function callOffBody(
  kind: CommitmentKind,
  until: number,
  now: number,
  stake: StakeView | null,
): string {
  const at = describeClock(until, now);
  const after =
    kind === 'goal'
      ? 'After that it runs to its deadline.'
      : 'After that, ending it takes a week’s notice.';
  const friend =
    stake?.kind === 'friend' ? ` ${stake.friendName} hears about it then, not before.` : '';
  return `You can call it off or change the terms until ${at}. ${after}${friend}`;
}

/** The confirm before calling it off: what doesn't happen. */
export function callOffConfirm(stake: StakeView | null): { title: string; message: string } {
  const gone = 'it’s gone for good';
  switch (stake?.kind) {
    case 'money':
      return { title: 'Call it off?', message: `Nothing is charged, and ${gone}.` };
    case 'friend':
      return {
        title: 'Call it off?',
        message: `${stake.friendName} never hears about it, and ${gone}.`,
      };
    case 'lockout':
      return { title: 'Call it off?', message: `No lockout, and ${gone}.` };
    default:
      return { title: 'Call it off?', message: 'It’s gone for good.' };
  }
}

/** Under the locked-in card. */
export function lockedInCallOff(until: number, now: number): string {
  return `Second thoughts? You can call it off or change the terms from its page until ${describeClock(until, now)}.`;
}
