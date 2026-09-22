import { useMutation } from 'convex/react';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { ToastHost } from '@/components/toast';
import { api } from '@/convex/_generated/api';
import { logInRevenueCat, logOutRevenueCat } from '@/lib/revenuecat';

export default function AppLayout() {
  const storeUser = useMutation(api.users.storeUser);

  // This layout only mounts behind the authenticated guard, so the identity is
  // always present. Queries tolerate the user row not existing yet and
  // re-resolve on their own once it lands. The user id is also RevenueCat's
  // customer id; unmounting means sign-out, which hands the device back to an
  // anonymous customer.
  useEffect(() => {
    let cancelled = false;
    storeUser()
      .then((userId) => (cancelled ? undefined : logInRevenueCat(userId)))
      .catch((error: unknown) => {
        console.error('Failed to store the signed-in user', error);
      });
    return () => {
      cancelled = true;
      void logOutRevenueCat();
    };
  }, [storeUser]);

  return (
    <View style={styles.root}>
      <AppTabs />
      {/* Above every tab and screen, so a verdict shows wherever the user is. */}
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
