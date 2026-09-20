import { Stack } from 'expo-router';

import { sheetScreenOptions } from '@/constants/sheet-screen-options';

export const unstable_settings = {
  // Keeps the habits screen mounted behind a deep-linked sheet, so dismissing
  // one lands on the list rather than an empty stack.
  anchor: 'index',
};

export default function HabitsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={sheetScreenOptions} />
      <Stack.Screen name="habit/[habitId]/index" />
      <Stack.Screen name="habit/[habitId]/edit" options={sheetScreenOptions} />
      <Stack.Screen
        name="habit/[habitId]/verify"
        // Taller than the form sheets: a photo preview sits above the buttons.
        options={{ ...sheetScreenOptions, sheetAllowedDetents: [0.72] }}
      />
    </Stack>
  );
}
