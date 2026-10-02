import { INVITE_DISPLAY_URL, inviteUrl } from '@/convex/lib/invite';
import type { ShareCardKind } from '@/data/share-copy';

/** What the cards print in their footer, for posts that drop the caption's link. */
export const SHARE_DISPLAY_URL = INVITE_DISPLAY_URL;

/**
 * Where a shared card sends people: the website's `/get` page, tagged with
 * the card and, once signed in, the sharer's invite code (`convex/lib/invite.ts`).
 */
export function shareUrl(card: ShareCardKind, ref?: string): string {
  return inviteUrl(card, ref);
}
