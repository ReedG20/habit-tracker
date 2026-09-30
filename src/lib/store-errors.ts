/** What a RevenueCat `PurchasesError` carries beyond its generic message. */
export type StoreErrorDetails = {
  code?: string;
  readableErrorCode?: string;
  underlyingErrorMessage?: string;
};

/**
 * The store's own reason for a failure. RevenueCat's message is often just
 * "There was a problem with the App Store."; the readable code and StoreKit's
 * underlying message say what actually went wrong. Empty for any other error.
 */
export function storeErrorDetails(error: unknown): StoreErrorDetails {
  if (typeof error !== 'object' || error === null) return {};
  const { code, readableErrorCode, underlyingErrorMessage, userInfo } = error as {
    code?: unknown;
    readableErrorCode?: unknown;
    underlyingErrorMessage?: unknown;
    userInfo?: { readableErrorCode?: unknown } | null;
  };
  const details: StoreErrorDetails = {};
  if (typeof code === 'string' || typeof code === 'number') details.code = String(code);
  // The top-level copy is deprecated in favour of `userInfo`; older paths still set only it.
  const readable = userInfo?.readableErrorCode ?? readableErrorCode;
  if (typeof readable === 'string' && readable.length > 0) details.readableErrorCode = readable;
  if (typeof underlyingErrorMessage === 'string' && underlyingErrorMessage.length > 0) {
    details.underlyingErrorMessage = underlyingErrorMessage;
  }
  return details;
}
