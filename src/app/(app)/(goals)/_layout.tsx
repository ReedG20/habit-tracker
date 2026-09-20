import { Stack } from 'expo-router';

import { sheetScreenOptions } from '@/constants/sheet-screen-options';

export const unstable_settings = {
  // Keeps the goals list mounted behind a deep-linked screen, so going back
  // lands on the list rather than an empty stack.
  anchor: 'goals/index',
};

export default function GoalsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="goals/index" />
      {/* Full screens, not sheets: a goal is a bigger commitment than a habit,
          and the submit screen holds a photo grid plus the keyboard. */}
      <Stack.Screen name="goals/new" />
      <Stack.Screen name="goals/[goalId]/index" />
      <Stack.Screen name="goals/[goalId]/edit" options={sheetScreenOptions} />
      <Stack.Screen name="goals/[goalId]/submit" />
    </Stack>
  );
}
