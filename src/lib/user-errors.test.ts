import { ConvexError } from 'convex/values';
import { describe, expect, test } from 'vitest';

import { UserFacingError, userErrorMessage } from './user-errors';

describe('userErrorMessage', () => {
  test('shows a server refusal as worded', () => {
    const error = new ConvexError('Pick someone other than yourself');
    expect(userErrorMessage(error, 'Try again.')).toBe('Pick someone other than yourself');
  });

  test('shows a device error written for people', () => {
    expect(userErrorMessage(new UserFacingError('Your card was declined.'), 'Try again.')).toBe(
      'Your card was declined.',
    );
  });

  test('falls back for anything else', () => {
    // What production sends for a plain server error.
    const redacted = new Error('[CONVEX M(goals:create)] [Request ID: 1] Server Error');
    expect(userErrorMessage(redacted, 'Try again.')).toBe('Try again.');
    expect(userErrorMessage(new ConvexError({ code: 'x' }), 'Try again.')).toBe('Try again.');
    expect(userErrorMessage('offline', 'Try again.')).toBe('Try again.');
  });
});
