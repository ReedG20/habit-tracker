import { Stack } from 'expo-router';

/**
 * Gives the group a navigator of its own so the root layout can guard it as a
 * single `(auth)` screen.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
