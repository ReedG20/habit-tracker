import { describe, expect, test } from 'vitest';

import { COMMITMENT_ICON_SVGS, commitmentIcon } from './commitment-icons';
import { GoalListIcon, HabitIcon } from './icons';

import { COMMITMENT_ICONS } from '@/convex/lib/commitmentIcons';

describe('commitment icons', () => {
  // The deep-import type shim accepts any name, so only loading them proves each one exists.
  test('every key has a glyph that loads', () => {
    for (const { key } of COMMITMENT_ICONS) {
      const glyph = COMMITMENT_ICON_SVGS[key];
      expect(Array.isArray(glyph) && glyph.length > 0, key).toBe(true);
    }
  });

  test('keys are unique', () => {
    const keys = COMMITMENT_ICONS.map((icon) => icon.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('falls back to the kind’s icon when there is none or it is unknown', () => {
    expect(commitmentIcon('run', 'habit')).toBe(COMMITMENT_ICON_SVGS.run);
    expect(commitmentIcon(undefined, 'habit')).toBe(HabitIcon);
    expect(commitmentIcon('retired-key', 'goal')).toBe(GoalListIcon);
  });
});
