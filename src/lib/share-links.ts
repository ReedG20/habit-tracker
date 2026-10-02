import type { ShareCardKind } from '@/data/share-copy';

/**
 * Where a shared card sends people: a page on the website, which redirects to
 * the App Store (or shows a download button). It lives outside this repo, so
 * the `from` tag is the only thing the app controls; the page can carry it on
 * as an App Store campaign token.
 */
export const SHARE_BASE_URL = 'https://useanteapp.com/get';

/** What the cards print in their footer, for posts that drop the caption's link. */
export const SHARE_DISPLAY_URL = 'useanteapp.com';

export function shareUrl(card: ShareCardKind): string {
  return `${SHARE_BASE_URL}?from=${card}`;
}
