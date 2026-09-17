import type { IconSvgElement } from '@hugeicons/react-native';

import { Dumbbell01Icon, Notebook01Icon, Yoga01Icon } from '@/constants/icons';
import type { Doc } from '@/convex/_generated/dataModel';

/**
 * Icons are JavaScript objects, so the database stores a key instead and this
 * map resolves it. The key union comes from the Convex schema, which means
 * adding a key there is a type error here until it is mapped.
 */
export type HabitIconKey = Doc<'habits'>['iconKey'];

export const HabitIcons: Record<HabitIconKey, IconSvgElement> = {
  dumbbell: Dumbbell01Icon,
  notebook: Notebook01Icon,
  yoga: Yoga01Icon,
};
