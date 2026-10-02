import type { CommitmentKind } from '@/components/commitment/draft';
import { frequencyLabel } from '@/convex/lib/frequency';
import { formatDueAt } from '@/lib/dates';

/**
 * The text a user sends the friend they just put on the hook, so the first
 * word comes from them rather than from Ante's email. Pure, so it's tested.
 * First person, plain, and short enough to read in a notification.
 */

export type FriendText = {
  friendName: string;
  title: string;
  /** "every day", "3 times a week", "by Fri, Oct 24, 9:00 PM". */
  cadence: string;
  kind: CommitmentKind;
  url: string;
};

/** How often or by when, in the words the text uses. */
export function friendTextCadence(
  commitment: { kind: 'habit'; timesPerWeek: number } | { kind: 'goal'; dueAt: number },
): string {
  return commitment.kind === 'habit'
    ? frequencyLabel(commitment.timesPerWeek).toLowerCase()
    : `by ${formatDueAt(commitment.dueAt)}`;
}

export function friendTextBody({ friendName, title, cadence, kind, url }: FriendText): string {
  const miss = kind === 'habit' ? 'If I skip it' : 'If I miss it';
  return [
    `Hey ${friendName}, I just put you on the hook: “${title.trim()}”, ${cadence}.`,
    `${miss}, Ante emails you so you can call me out. Nothing for you to do. Just don’t let me off easy.`,
    url,
  ].join(' ');
}
