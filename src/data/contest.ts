import type { ContestReason } from '@/convex/lib/chargeReviewSchema';
import { CONTEST_REASON_LABELS } from '@/convex/lib/supportCopy';

/**
 * The reasons a charge can be contested for (`/contest/[stakeId]`), in the
 * order they're offered. Support's email shows the same words.
 */
export const CONTEST_REASONS: { reason: ContestReason; label: string }[] = (
  ['proof_should_count', 'did_it_not_recorded', 'app_problem', 'dont_recognize', 'other'] as const
).map((reason) => ({ reason, label: CONTEST_REASON_LABELS[reason] }));
