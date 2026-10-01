import { DAY_ENDS_AT_HOUR, previousDay } from './days';
import {
  goalOffsets,
  PRESET_RULES,
  QUIET_FALLBACK,
  QUIET_UNTIL,
  type ReminderPreset,
  type ReminderSettings,
} from './reminderPresets';
import { HOUR_MS, localClock, MINUTE_MS, zonedDay, zonedInstant } from './zonedTime';

/**
 * When the nudges for one deadline land. Pure and free of Convex imports, so
 * the Reminders screen previews exactly what the backend will send.
 */

/** Slots this close together go out together; the later one wins. */
export const MERGE_MS = 10 * MINUTE_MS;
/** A goal needs at least this much lead for a short-notice final call. */
const MIN_SHORT_LEAD_MS = 15 * MINUTE_MS;
/** An early nudge moved out of the night must still leave this long to act. */
const MIN_MORNING_LEAD_MS = 30 * MINUTE_MS;

export type RawSlot = { at: number; final: boolean };

/**
 * Keeps early nudges strictly before the final call, and at least `MERGE_MS`
 * apart from each other and from it: when two collide, the later one wins.
 */
function tidy(raw: RawSlot[]): RawSlot[] {
  const final = raw.find((slot) => slot.final);
  const early = raw
    .filter((slot) => !slot.final && (final === undefined || slot.at <= final.at - MERGE_MS))
    .sort((a, b) => a.at - b.at);

  const kept: RawSlot[] = [];
  for (let index = 0; index < early.length; index += 1) {
    const next = early[index + 1];
    if (next !== undefined && next.at - early[index].at < MERGE_MS) continue;
    kept.push(early[index]);
  }
  return final === undefined ? kept : [...kept, final];
}

/**
 * The nudges for a goal due at `dueAt`, made at `createdAt`. Offsets that fall
 * before it was made are skipped; a goal made with less lead than even the
 * final call gets one at the halfway point instead. Early nudges that land
 * overnight move to the morning, or back to the evening before; the final
 * call never moves, since someone who picked a 2 AM deadline is awake for it.
 */
export function goalSlotTimes(
  dueAt: number,
  createdAt: number,
  settings: Pick<ReminderSettings, 'preset'>,
  timeZone: string | undefined,
): RawSlot[] {
  const offsets = goalOffsets(settings.preset);
  const last = offsets.length - 1;
  const raw: RawSlot[] = [];

  offsets.forEach((offset, index) => {
    const at = dueAt - offset;
    if (at >= createdAt) raw.push({ at, final: index === last });
  });

  if (!raw.some((slot) => slot.final)) {
    const lead = dueAt - createdAt;
    if (lead / 2 >= MIN_SHORT_LEAD_MS) {
      raw.push({ at: dueAt - Math.min(offsets[last], lead / 2), final: true });
    }
  }

  if (timeZone === undefined) return tidy(raw);

  const quietEnd = QUIET_UNTIL.hour * 60 + QUIET_UNTIL.minute;
  const shifted: RawSlot[] = [];
  for (const slot of raw) {
    if (slot.final || localClock(slot.at, timeZone) >= quietEnd) {
      shifted.push(slot);
      continue;
    }
    const day = zonedDay(slot.at, timeZone);
    const morning = zonedInstant(day, QUIET_UNTIL.hour, QUIET_UNTIL.minute, timeZone);
    const at =
      dueAt - morning >= MIN_MORNING_LEAD_MS
        ? morning
        : zonedInstant(previousDay(day), QUIET_FALLBACK.hour, QUIET_FALLBACK.minute, timeZone);
    if (at >= createdAt) shifted.push({ at, final: false });
  }
  return tidy(shifted);
}

/**
 * Tonight's nudges for habits whose day ends at `dayEnd`. The day runs on to
 * `DAY_ENDS_AT_HOUR` so a late log still counts, but nobody wants a nudge at
 * 2 AM: the preset's offsets count back from the midnight before it instead.
 */
export function habitSlotTimes(dayEnd: number, preset: ReminderPreset): RawSlot[] {
  const { offsets } = PRESET_RULES[preset];
  const bedtime = dayEnd - DAY_ENDS_AT_HOUR * HOUR_MS;
  return offsets.map((offset, index) => ({
    at: bedtime - offset,
    final: index === offsets.length - 1,
  }));
}
