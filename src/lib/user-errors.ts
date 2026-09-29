import { ConvexError } from 'convex/values';

/**
 * An error raised on the device whose message is already written for people,
 * like Stripe's PaymentSheet saying why a card didn't go through.
 */
export class UserFacingError extends Error {
  name = 'UserFacingError';
}

/**
 * What to tell the user when a call fails. The server words its refusals for
 * people ("already logged for today", "pick someone other than yourself") and
 * sends them as `ConvexError`s, which survive production. Any other server
 * error reads only "Server Error" there, so it, like anything else unexpected
 * (a dropped connection, a bug), gets the caller's fallback.
 */
export function userErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) return typeof error.data === 'string' ? error.data : fallback;
  if (error instanceof UserFacingError) return error.message;
  return fallback;
}
