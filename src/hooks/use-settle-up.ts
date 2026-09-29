import { useStripe } from '@stripe/stripe-react-native';
import { useAction } from 'convex/react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { formatCents } from '@/lib/money';
import { UserFacingError } from '@/lib/user-errors';

export type SettleUpResult = 'settled' | 'pending' | 'canceled';

export type SettleUp = {
  supported: boolean;
  /** Pays a declined stake now, on this device. Throws on anything but backing out. */
  settle: (stakeId: Id<'stakes'>) => Promise<SettleUpResult>;
};

/**
 * Paying a stake the card declined: an on-session PaymentSheet, so a bank
 * that wants to confirm it's them can ask. The server only trusts Stripe's
 * word that it went through (`stakes.confirmSettleUp`, or the webhook).
 */
export function useSettleUp(): SettleUp {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const start = useAction(api.stakes.settleUp);
  const confirm = useAction(api.stakes.confirmSettleUp);

  return {
    supported: true,
    settle: async (stakeId) => {
      const intent = await start({ stakeId });

      const init = await initPaymentSheet({
        merchantDisplayName: 'Ante',
        customerId: intent.customerId,
        customerSessionClientSecret: intent.customerSessionClientSecret,
        paymentIntentClientSecret: intent.paymentIntentClientSecret,
        returnURL: 'ante://stripe-redirect',
        allowsDelayedPaymentMethods: false,
        primaryButtonLabel: `Pay ${formatCents(intent.amountCents)}`,
      });
      if (init.error) throw new UserFacingError(init.error.message);

      const { error } = await presentPaymentSheet();
      if (error?.code === 'Canceled') return 'canceled';
      if (error) throw new UserFacingError(error.message);

      const { settled } = await confirm({ stakeId });
      return settled ? 'settled' : 'pending';
    },
  };
}
