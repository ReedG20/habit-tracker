import { v } from 'convex/values';

/**
 * Where a user's comeback nudges stand (`comebacks.ts`): the pushes that go
 * out once nothing is running. One row per user, rewritten whenever a
 * commitment ends. Kept out of `schema.ts` so that file only grows by the
 * table registration.
 */

export const comebackStepValidator = v.union(v.literal(1), v.literal(3), v.literal(7));

export const comebackOutcomeValidator = v.union(
  v.literal('kept'),
  v.literal('missed'),
  v.literal('ended'),
);

export const comebackValidator = v.object({
  userId: v.id('users'),
  /** The user's local day the last commitment ended; steps count days from it. */
  anchorDay: v.string(),
  /** The next nudge to send, in days after `anchorDay`. */
  step: comebackStepValidator,
  /** How the last one ended, which sets the first nudge's tone. */
  outcome: comebackOutcomeValidator,
  lastTitle: v.optional(v.string()),
  /** A kept one's Kept row, so the nudge can open "Go again" on its terms. */
  accomplishmentId: v.optional(v.id('accomplishments')),
  /** When this sequence was started; a job from an older one finds it changed and stops. */
  armedAt: v.number(),
  jobId: v.optional(v.id('_scheduled_functions')),
});
