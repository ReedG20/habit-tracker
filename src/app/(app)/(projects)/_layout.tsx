import { Stack } from 'expo-router';

import { sheetScreenOptions } from '@/constants/sheet-screen-options';

export const unstable_settings = {
  anchor: 'projects',
};

export default function ProjectsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="projects" />
      <Stack.Screen name="project/[projectId]/index" />
      <Stack.Screen name="project/new" options={sheetScreenOptions} />
      <Stack.Screen name="project/[projectId]/edit" options={sheetScreenOptions} />
    </Stack>
  );
}
