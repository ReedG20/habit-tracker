import { Stack } from 'expo-router';

import { sheetScreenOptions } from '@/constants/sheet-screen-options';

export const unstable_settings = {
  // Keeps the list screen mounted behind a deep-linked sheet, so dismissing one
  // lands on the habits list rather than an empty stack.
  anchor: 'index',
};

export default function HabitsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="habit/[habitId]/index" />
      <Stack.Screen name="habit/new" options={sheetScreenOptions} />
      <Stack.Screen name="habit/[habitId]/edit" options={sheetScreenOptions} />
    </Stack>
  );
}
