import type { StakePayment } from './use-stake-payment';

/** No Stripe SDK on web: the stake picker is hidden and only plain goals can be created. */
export function useStakePayment(): StakePayment {
  return {
    supported: false,
    collectCard: () => Promise.reject(new Error('Stakes are not available on web')),
  };
}
