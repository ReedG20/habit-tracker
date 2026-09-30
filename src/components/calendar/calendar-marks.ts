import type { ViewStyle } from 'react-native';

import type { useTheme } from '@/hooks/use-theme';

type Theme = ReturnType<typeof useTheme>;

/**
 * What a calendar day's dot can say, whichever calendar it's in. The Me
 * screen's month, a habit's recent weeks and the Commitments strip all map
 * their own day states onto these, so a mark means the same thing everywhere.
 *
 * - `done`: kept (on the Me screen: every daily habit logged).
 * - `partial`: some of it, or a check still being looked at.
 * - `missed`: a day that counted went by without a log.
 * - `frozen`: a lockout froze the habits.
 * - `open`: still to do today, or excused (our error), so not held against you.
 * - `off`: nothing was owed.
 * - `future`: hasn't happened yet, or before there was anything to track.
 */
export type CalendarMark = 'done' | 'partial' | 'missed' | 'frozen' | 'open' | 'off' | 'future';

export const DOT = 14;
export const RING_GAP = 1.5;
export const RING_WIDTH = 1.5;
/** A dot with room for today's ring around it. */
export const RING = DOT + 2 * (RING_GAP + RING_WIDTH);

export function markStyle(mark: CalendarMark, theme: Theme): ViewStyle {
  switch (mark) {
    case 'done':
      return { backgroundColor: theme.accent };
    case 'partial':
      // ~35% of the accent.
      return { backgroundColor: `${theme.accent}59` };
    case 'missed':
      // ~40% of the secondary text: plain, but clearly there.
      return { backgroundColor: `${theme.textSecondary}66` };
    case 'frozen':
      return { borderWidth: 2, borderColor: theme.primary };
    case 'open':
      return { borderWidth: 1, borderColor: theme.textSecondary };
    case 'off':
      // A speck: nothing was owed that day.
      return { backgroundColor: theme.textSecondary, opacity: 0.35, transform: [{ scale: 0.3 }] };
    case 'future':
      return { borderWidth: 1, borderColor: theme.border };
  }
}
