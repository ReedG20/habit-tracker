import type { IconSvgElement } from '@hugeicons/react-native';

import { Camera01Icon, Location01Icon, Timer02Icon } from '@/constants/icons';
import {
  DEV_TIMER_MINUTES,
  TIMER_MINUTE_OPTIONS,
  type ProofMethod,
} from '@/convex/lib/proofMethods';

export type { ProofMethod };

/**
 * Everything the app says about each way of proving a habit, in one place: the
 * picker when it's made, the card's button, the prove screen and the copy
 * around them.
 */
export type ProofMethodInfo = {
  label: string;
  /** Under the label in the picker. */
  hint: string;
  icon: IconSvgElement;
  /** The chip at the top of the prove screen. */
  chip: string;
  /** The card's button. */
  verb: string;
  /** The proof field while making the habit. */
  proofLabel: string;
  proofPlaceholder: string;
  /** Alert when the proof field is left empty. */
  emptyProof: string;
};

export const PROOF_METHODS: Record<ProofMethod, ProofMethodInfo> = {
  photo: {
    label: 'Photo',
    hint: 'AI checks it',
    icon: Camera01Icon,
    chip: 'Photo proof',
    verb: 'Log',
    proofLabel: 'What does the photo need to show?',
    proofPlaceholder: 'Me at the gym with the equipment in view, not the parking lot',
    emptyProof: 'Say what the photo needs to show',
  },
  location: {
    label: 'Location',
    hint: 'be there',
    icon: Location01Icon,
    chip: 'Check in',
    verb: 'Check in',
    proofLabel: 'Where will you check in?',
    proofPlaceholder: 'Any gym, or one by name like “Equinox Flatiron”',
    emptyProof: 'Say where you’ll check in',
  },
  timer: {
    label: 'Timer',
    hint: 'app open',
    icon: Timer02Icon,
    chip: 'Timer',
    verb: 'Start',
    proofLabel: 'What will you do while it runs?',
    proofPlaceholder: 'Sit on my cushion and meditate, phone face up beside me',
    emptyProof: 'Say what you’ll do while the timer runs',
  },
};

export const PROOF_METHOD_ORDER: ProofMethod[] = ['photo', 'location', 'timer'];

/** Development builds also get a one-minute timer, to try the flow without waiting. */
// `typeof` keeps it importable from unit tests, which run outside Metro.
export const TIMER_MINUTES: number[] =
  typeof __DEV__ !== 'undefined' && __DEV__
    ? [DEV_TIMER_MINUTES, ...TIMER_MINUTE_OPTIONS]
    : [...TIMER_MINUTE_OPTIONS];

export const DEFAULT_TIMER_MINUTES = 20;

/** "20:00", "1:30:00". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/** "20 min", "1 hr 30 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function proofMethodOf(habit: { proofMethod?: ProofMethod }): ProofMethod {
  return habit.proofMethod ?? 'photo';
}

/** What the card's button says to VoiceOver: "Log Run", "Start the 20-minute timer for Read". */
export function proveLabel(habit: {
  title: string;
  proofMethod?: ProofMethod;
  timerMinutes?: number;
}): string {
  const method = proofMethodOf(habit);
  if (method === 'timer' && habit.timerMinutes !== undefined) {
    return `Start the ${habit.timerMinutes}-minute timer for ${habit.title}`;
  }
  return `${PROOF_METHODS[method].verb} ${habit.title}`;
}
