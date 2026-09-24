import { Stack } from 'expo-router';

import { sheetScreenOptions } from '@/constants/sheet-screen-options';

// This group is shared by the Today and Commitments tabs, so a habit or goal
// opens inside whichever tab it was tapped from. Each tab anchors on its own
// list, which also keeps that list mounted behind a deep-linked screen.
export const unstable_settings = {
  anchor: 'index',
  commitments: {
    anchor: 'commitments',
  },
};

export default function CommitmentsLayout({ segment }: { segment: string }) {
  // The first screen listed is the one a tab opens on, and it outranks the
  // anchor above, so each tab lists its own list first.
  const lists = segment === '(commitments)' ? ['commitments', 'index'] : ['index', 'commitments'];

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {lists.map((name) => (
        <Stack.Screen key={name} name={name} />
      ))}
      <Stack.Screen name="habit/[habitId]/index" />
      <Stack.Screen name="habit/[habitId]/edit" options={sheetScreenOptions} />
      <Stack.Screen
        name="habit/[habitId]/verify"
        // Taller than the form sheets: a photo preview sits above the buttons.
        options={{ ...sheetScreenOptions, sheetAllowedDetents: [0.72] }}
      />
      <Stack.Screen name="goals/[goalId]/index" />
      <Stack.Screen name="goals/[goalId]/edit" options={sheetScreenOptions} />
      <Stack.Screen name="goals/[goalId]/submit" />
    </Stack>
  );
}
