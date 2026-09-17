import type { Doc } from '../_generated/dataModel';

type SeedHabit = Omit<Doc<'habits'>, '_id' | '_creationTime' | 'userId' | 'order'>;

/** Seeded on first sign-in so the Habits screen has something in it. */
export const DEFAULT_HABITS: SeedHabit[] = [
  {
    title: 'Go to the gym',
    streak: 12,
    frequency: '4x / week',
    verification: 'location',
    iconKey: 'dumbbell',
  },
  {
    title: 'Journaling',
    streak: 5,
    frequency: 'Daily',
    verification: 'camera',
    iconKey: 'notebook',
  },
  {
    title: 'Mindfulness',
    streak: 23,
    frequency: 'Daily',
    verification: 'timer',
    iconKey: 'yoga',
  },
];
