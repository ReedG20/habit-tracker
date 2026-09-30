import { describe, expect, test } from 'vitest';

import { storeErrorDetails } from './store-errors';

describe('storeErrorDetails', () => {
  test("reads a RevenueCat error's code and StoreKit reason", () => {
    const error = {
      code: '2',
      message: 'There was a problem with the App Store.',
      readableErrorCode: 'STORE_PROBLEM',
      userInfo: { readableErrorCode: 'STORE_PROBLEM' },
      underlyingErrorMessage: 'Cannot connect to iTunes Store',
    };
    expect(storeErrorDetails(error)).toEqual({
      code: '2',
      readableErrorCode: 'STORE_PROBLEM',
      underlyingErrorMessage: 'Cannot connect to iTunes Store',
    });
  });

  test('falls back to the top-level readable code', () => {
    expect(storeErrorDetails({ readableErrorCode: 'STORE_PROBLEM' })).toEqual({
      readableErrorCode: 'STORE_PROBLEM',
    });
  });

  test('is empty for anything else', () => {
    expect(storeErrorDetails(new Error('boom'))).toEqual({});
    expect(storeErrorDetails({ underlyingErrorMessage: '' })).toEqual({});
    expect(storeErrorDetails('boom')).toEqual({});
    expect(storeErrorDetails(null)).toEqual({});
  });
});
