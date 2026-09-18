import { useMutation } from 'convex/react';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { ToastHost } from '@/components/toast';
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
