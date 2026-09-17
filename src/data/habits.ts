import type { IconSvgElement } from '@hugeicons/react-native';

import { AiCameraIcon, Location01Icon, Timer01Icon } from '@/constants/icons';
import type { Doc } from '@/convex/_generated/dataModel';

export type Habit = Doc<'habits'>;
export type VerificationMethod = Habit['verification'];

/** Presentation only — the stored value is the key. */
export const Verifications: Record<VerificationMethod, { label: string; icon: IconSvgElement }> = {
  camera: { label: 'Photo', icon: AiCameraIcon },
  location: { label: 'Check in', icon: Location01Icon },
  timer: { label: 'Timed', icon: Timer01Icon },
};
