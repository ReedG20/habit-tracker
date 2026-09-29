import { ConvexError, v } from 'convex/values';

/**
 * How a habit gets proved. Chosen when the habit is made and fixed after that,
 * so nobody can switch to an easier method in the middle of a stake. Habits
 * from before methods existed have none, which means photo.
 */
export const proofMethodValidator = v.union(
  v.literal('photo'),
  v.literal('location'),
  v.literal('timer'),
);

export type ProofMethod = typeof proofMethodValidator.type;

export function proofMethodOf(habit: { proofMethod?: ProofMethod }): ProofMethod {
  return habit.proofMethod ?? 'photo';
}

/** Mirrored by `TIMER_MINUTE_OPTIONS` in `src/constants/proof-methods.ts`. */
export const TIMER_MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90] as const;

/**
 * Dev and preview builds also offer a one-minute timer so the flow can be
 * tried without waiting; `ANTE_DEV_OVERRIDES` lets the server accept it.
 */
export const DEV_TIMER_MINUTES = 1;

export function isValidTimerMinutes(minutes: number, devOverrides: boolean): boolean {
  return (
    (TIMER_MINUTE_OPTIONS as readonly number[]).includes(minutes) ||
    (devOverrides && minutes === DEV_TIMER_MINUTES)
  );
}

/**
 * The method and its settings for a new habit. A timer needs its length, and
 * nothing else takes one.
 */
export function requireProofSettings(
  args: { proofMethod?: ProofMethod; timerMinutes?: number },
  devOverrides: boolean,
): { proofMethod: ProofMethod; timerMinutes?: number } {
  const proofMethod = args.proofMethod ?? 'photo';
  if (proofMethod !== 'timer') {
    if (args.timerMinutes !== undefined) throw new ConvexError('Only a timer habit has a length');
    return { proofMethod };
  }
  if (args.timerMinutes === undefined || !isValidTimerMinutes(args.timerMinutes, devOverrides)) {
    throw new ConvexError('Pick how long the timer runs');
  }
  return { proofMethod, timerMinutes: args.timerMinutes };
}
