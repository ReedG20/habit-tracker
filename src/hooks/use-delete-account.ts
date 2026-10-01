import { useUser } from '@clerk/expo';
import { useAction } from 'convex/react';
import { useCallback } from 'react';

import { api } from '@/convex/_generated/api';
import { useSignOut } from '@/hooks/use-sign-out';
import { captureError, track } from '@/lib/analytics';
import { notify } from '@/lib/confirm';
import { UserFacingError } from '@/lib/user-errors';

/**
 * Deletes the account: Ante's data first (`users.deleteAccount`, which needs
 * the session to know who's asking), then the Clerk user, then signs out.
 * Throws if the data couldn't be deleted; nothing is signed out then.
 */
export function useDeleteAccount(): () => Promise<void> {
  const { user } = useUser();
  const deleteAccount = useAction(api.users.deleteAccount);
  const signOut = useSignOut();

  return useCallback(async () => {
    // Checked first: with it off in the Clerk dashboard, the data would go but
    // the sign-in would stay, and signing in again would start a blank account.
    if (!user?.deleteSelfEnabled) {
      throw new UserFacingError('Deleting accounts is switched off right now. Try again later.');
    }

    await deleteAccount({});
    track('account deleted');

    let signInRemains = false;
    try {
      await user.delete();
    } catch (error: unknown) {
      signInRemains = true;
      captureError(error, 'delete clerk user');
    }
    // Deleting the Clerk user usually ends the session already.
    await signOut().catch((error: unknown) => captureError(error, 'sign out after delete'));

    if (signInRemains) {
      notify(
        'Your data is deleted',
        'Your sign-in couldn’t be removed just now. Signing in again starts a new, empty account.',
      );
    }
  }, [user, deleteAccount, signOut]);
}
