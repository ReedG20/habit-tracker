import { formatMoney } from '@/convex/lib/reminderCopy';
import type { PushPermission } from '@/lib/notifications';

/**
 * The Today screen's "notifications are off" card. It asks, it doesn't nag:
 * only when there's something on the line to be reminded about, and a dismissal
 * holds for a few days — unless a deadline is under a day away, when being
 * reminded matters more than being polite.
 */

export const BANNER_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const URGENT_MS = 24 * 60 * 60 * 1000;

export type BannerInput = {
  permission: PushPermission | null;
  /** The soonest open deadline, or `null` when nothing is open. */
  nextDeadline: number | null;
  snoozedUntil: number | null;
  now: number;
};

export function shouldShowNotificationsBanner({
  permission,
  nextDeadline,
  snoozedUntil,
  now,
}: BannerInput): boolean {
  if (permission !== 'denied' && permission !== 'undetermined') return false;
  if (nextDeadline === null) return false;
  if (nextDeadline - now < URGENT_MS) return true;
  return snoozedUntil === null || now >= snoozedUntil;
}

export type BannerCopy = { title: string; body: string; action: string };

/**
 * Leads with what's at stake: the money on the soonest staked goal, or the
 * lock a missed habit brings.
 */
export function notificationsBannerCopy({
  permission,
  stakedGoal,
  hasHabits,
}: {
  permission: 'denied' | 'undetermined';
  stakedGoal: { title: string; amountCents: number } | null;
  hasHabits: boolean;
}): BannerCopy {
  const stakes =
    stakedGoal !== null
      ? `${formatMoney(stakedGoal.amountCents)} is riding on ${stakedGoal.title}.`
      : hasHabits
        ? 'Miss a day and Ante locks.'
        : 'Your word’s on the line.';

  if (permission === 'undetermined') {
    return {
      title: 'Want a heads-up?',
      body: `${stakes} Ante can nudge you before a deadline, only when it’s still open.`,
      action: 'Turn on',
    };
  }
  return {
    title: 'Notifications are off',
    body: `${stakes} We can’t warn you before a deadline.`,
    action: 'Open Settings',
  };
}
