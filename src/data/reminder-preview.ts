import type { StakeView } from '@/convex/lib/stakeRules';
import { formatDueLabel, reminderCopy, type PushCopy } from '@/convex/lib/reminderCopy';
import type { ReminderSettings } from '@/convex/lib/reminderPresets';
import { goalSlotTimes, habitSlotTimes } from '@/convex/lib/reminderTimes';

/**
 * What the Reminders screen and the onboarding step show: the pushes one
 * commitment would get under a preset, with the backend's own timing and words.
 */

export type PreviewSubject =
  | { kind: 'habit'; title: string }
  | {
      kind: 'goal';
      title: string;
      dueAt: number;
      createdAt: number;
      stakeCents: number | null;
    };

export type PreviewPush = PushCopy & {
  at: number;
  final: boolean;
  /** Arrives as Time Sensitive, through Focus. */
  timeSensitive: boolean;
};

/** Stands in when there's nothing real to preview yet. */
export const SAMPLE_SUBJECT: PreviewSubject = { kind: 'habit', title: 'Morning run' };

/**
 * A habit shows tonight's nudges, as if it's still open; a goal shows its own,
 * each worded the way it would read when it lands.
 */
export function previewPushes(
  subject: PreviewSubject,
  settings: Pick<ReminderSettings, 'preset' | 'breakThroughFocus'>,
  context: { dayEnd: number; timeZone: string },
): PreviewPush[] {
  if (subject.kind === 'habit') {
    return habitSlotTimes(context.dayEnd, settings.preset).map((slot, step) => ({
      ...reminderCopy({
        kind: 'habits',
        habits: [{ title: subject.title }],
        msLeft: context.dayEnd - slot.at,
        final: slot.final,
        seed: 'preview:habits',
        step,
      }),
      at: slot.at,
      final: slot.final,
      timeSensitive: slot.final && settings.breakThroughFocus,
    }));
  }

  return goalSlotTimes(subject.dueAt, subject.createdAt, settings, context.timeZone).map(
    (slot, step) => ({
      ...reminderCopy({
        kind: 'goals',
        goals: [{ title: subject.title, stakeCents: subject.stakeCents }],
        dueLabel: formatDueLabel(subject.dueAt, slot.at, context.timeZone),
        msLeft: subject.dueAt - slot.at,
        final: slot.final,
        seed: 'preview:goal',
        step,
      }),
      at: slot.at,
      final: slot.final,
      timeSensitive: slot.final && settings.breakThroughFocus,
    }),
  );
}

type HabitLike = { title: string };
type GoalLike = {
  title: string;
  dueAt: number;
  completedAt?: number;
  _creationTime: number;
  stakeView?: StakeView | null;
};

/**
 * What to preview: a habit if there is one, since that's the everyday rhythm;
 * otherwise the next open goal; otherwise a stand-in.
 */
export function pickPreviewSubject(
  habits: HabitLike[] | undefined,
  goals: GoalLike[] | undefined,
  now: number,
): PreviewSubject {
  const habit = habits?.[0];
  if (habit !== undefined) return { kind: 'habit', title: habit.title };

  const goal = (goals ?? [])
    .filter((candidate) => candidate.completedAt === undefined && candidate.dueAt > now)
    .sort((a, b) => a.dueAt - b.dueAt)[0];
  if (goal !== undefined) {
    return {
      kind: 'goal',
      title: goal.title,
      dueAt: goal.dueAt,
      createdAt: goal._creationTime,
      stakeCents:
        goal.stakeView?.kind === 'money' && goal.stakeView.status === 'armed'
          ? goal.stakeView.amountCents
          : null,
    };
  }

  return SAMPLE_SUBJECT;
}
