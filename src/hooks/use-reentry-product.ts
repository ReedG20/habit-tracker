import { useCallback, useEffect, useState } from 'react';
import type { PurchasesStoreProduct } from 'react-native-purchases';

import { loadReentryProduct } from '@/lib/revenuecat';

export type ReentryProduct =
  | { status: 'loading' }
  | { status: 'ready'; product: PurchasesStoreProduct }
  /** No store here (web), the product is not live yet, or the store could not be reached. */
  | { status: 'unavailable'; retry: () => void };

/**
 * The re-entry fee as the store sells it, with the localized price
 * (`product.priceString`). The price lives in App Store Connect, so changing
 * it never needs an app update.
 */
export function useReentryProduct(): ReentryProduct {
  const [state, setState] = useState<ReentryProduct>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadReentryProduct()
      .then((product) => {
        if (cancelled) return;
        setState(
          product === null ? { status: 'unavailable', retry } : { status: 'ready', product },
        );
      })
      .catch((error: unknown) => {
        console.warn('Failed to load the re-entry fee', error);
        if (!cancelled) setState({ status: 'unavailable', retry });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, retry]);

  return state;
}
