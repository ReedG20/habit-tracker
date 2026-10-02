/**
 * How hard Ante nudges before a deadline. Shared by the backend, which plans
 * the pushes, and the app, which previews them, so the two never drift apart.
 *
 * There is deliberately no "off": Gentle is the floor. Someone who wants
 * silence can turn Ante off in iOS Settings, and the app will ask them back.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const REMINDER_PRESETS = ['gentle', 'firm', 'relentless'] as const;

export type ReminderPreset = (typeof REMINDER_PRESETS)[number];

export type PresetRules = {
  label: string;
  /** One line for the settings screen. */
  description: string;
  /**
   * How long before a deadline each nudge goes out, earliest first. The last
   * one is the final call: the only one that may break through Focus.
   */
  offsets: number[];
  /** Extra early heads-ups for goals, which can be days out. Earliest first. */
  goalHeadsUps: number[];
  /** Planned nudges per local day, final calls excepted. */
  dailyCap: number;
};

export const PRESET_RULES: Record<ReminderPreset, PresetRules> = {
  gentle: {
    label: 'Gentle',
    description: 'One heads-up, 3 hours out.',
    offsets: [3 * HOUR],
    goalHeadsUps: [],
    dailyCap: 3,
  },
  firm: {
    label: 'Firm',
    description: 'A nudge 5 hours out, then a last call.',
    offsets: [5 * HOUR, 90 * MINUTE],
    goalHeadsUps: [24 * HOUR],
    dailyCap: 6,
  },
  relentless: {
    label: 'Relentless',
    description: 'Won’t let it slide. Four nudges, from the afternoon on.',
    offsets: [10 * HOUR, 5 * HOUR, 2 * HOUR, 45 * MINUTE],
    goalHeadsUps: [72 * HOUR, 24 * HOUR],
    dailyCap: 10,
  },
};

export type ReminderSettings = {
  preset: ReminderPreset;
  /** A quiet 8:30 AM rundown of what's due today, only when something is. */
  morningLineup: boolean;
  /** Final calls arrive as Time Sensitive, so Focus modes let them through. */
  breakThroughFocus: boolean;
  /** A quiet note when a photo is approved. Rejections always come through. */
  approvals: boolean;
  /** A few nudges once nothing is running (`convex/comebacks.ts`). */
  comebacks: boolean;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  preset: 'firm',
  morningLineup: false,
  breakThroughFocus: true,
  approvals: true,
  comebacks: true,
};

/** Local wall-clock time of the morning lineup. */
export const LINEUP_TIME = { hour: 8, minute: 30 };

/**
 * Nothing but a final call goes out between midnight and 8 AM local. An early
 * nudge that would land there moves to 8 AM, or to 9:30 PM the evening before
 * when 8 AM is too close to the deadline to be any use.
 */
export const QUIET_UNTIL = { hour: 8, minute: 0 };
export const QUIET_FALLBACK = { hour: 21, minute: 30 };

/** Every offset for a goal under `preset`, earliest first; the last is final. */
export function goalOffsets(preset: ReminderPreset): number[] {
  const rules = PRESET_RULES[preset];
  return [...rules.goalHeadsUps, ...rules.offsets];
}
