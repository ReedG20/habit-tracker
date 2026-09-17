import { useMutation } from 'convex/react';
import { useEffect } from 'react';

import AppTabs from '@/components/app-tabs';
import { api } from '@/convex/_generated/api';

export default function AppLayout() {
  const storeUser = useMutation(api.users.storeUser);

  // This layout only mounts behind the authenticated guard, so the identity is
  // always present. Queries tolerate the user row not existing yet and
  // re-resolve on their own once it lands.
  useEffect(() => {
    storeUser().catch((error: unknown) => {
      console.error('Failed to store the signed-in user', error);
    });
  }, [storeUser]);

  return <AppTabs />;
}
