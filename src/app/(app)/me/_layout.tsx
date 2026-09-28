import { Stack } from 'expo-router';

// The Me tab's own stack, so its settings pages push in with the tab bar
// still there, the same way a habit or goal opens from Today.
export default function MeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
