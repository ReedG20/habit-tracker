/**
 * Links that bring someone new to Ante, and who sent them. Shared by the app
 * (share cards, a text to the friend on the hook) and the friend emails, so
 * every link carries the same two tags:
 *
 * - `from`: where the link was handed out.
 * - `ref`: the sender's invite code, so installs can be traced back to the
 *   person who brought them in.
 *
 * The `/get` page lives outside this repo; it redirects to the App Store and
 * can pass both tags on as campaign tokens.
 */

export const INVITE_BASE_URL = 'https://useanteapp.com/get';

/** What the cards print in their footer, for posts that drop the caption's link. */
export const INVITE_DISPLAY_URL = 'useanteapp.com';

export type InviteSource =
  // Share cards, by the card shown.
  | 'stake'
  | 'streak'
  | 'kept'
  // The friend emails.
  | 'heads_up'
  | 'loss'
  // The text a user sends the friend they named.
  | 'friend_text';

/** 32-bit FNV-1a, from a given offset basis so two runs give independent halves. */
function fnv1a(text: string, basis: number): number {
  let hash = basis >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A user's invite code: ten lowercase letters and digits, derived from their
 * id rather than stored, so it needs no column and no lookup. It doesn't
 * reveal the id, and it's the same everywhere it's computed.
 */
export function inviteCode(userId: string): string {
  const half = (basis: number) => fnv1a(userId, basis).toString(36).padStart(7, '0');
  return (half(0x811c9dc5) + half(0x9e3779b9)).slice(0, 10);
}

export function inviteUrl(from: InviteSource, ref?: string): string {
  const query = ref === undefined ? `from=${from}` : `from=${from}&ref=${ref}`;
  return `${INVITE_BASE_URL}?${query}`;
}
