import { ConvexError } from 'convex/values';

/**
 * What to tell the user when a proof call is refused. The server words its
 * refusals for people ("already logged for today", "not enough of today
 * left") and sends them as `ConvexError`s, which survive production; anything
 * else (a dropped connection, a bug) gets the caller's fallback.
 */
export function proofErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data;
  return fallback;
}
