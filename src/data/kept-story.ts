import type { Kept } from '@/convex/accomplishments';
import { DAILY } from '@/convex/lib/frequency';
import { formatCents } from '@/lib/money';

/**
 * The words on the Kept screen: the loss screen's opposite. Pure, so each
 * case is tested. It should land like a finish line: what was kept, for how
 * long, and what never had to happen because of it.
 */

export type KeptStory = {
  kicker: string;
  /** The big line: the run's length for a habit ("34" over "days"), "Done." for a goal. */
  headline: { kind: 'count'; count: number; unit: string } | { kind: 'words'; text: string };
  line: string;
  /** Terms in `line` and `stakeLine` set in bold. */
  emphasis: string[];
  /** What never had to happen; always something, since "just your word" is kept too. */
  stakeLine: string;
  /** The run as dots, habits only. */
  dots: { count: number; unit: 'day' | 'week' } | null;
  note: string;
};

const dueFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** "3 days early", "a day early", "with 5 hours to spare". */
function howEarly(dueAt: number, achievedAt: number): string {
  const ahead = dueAt - achievedAt;
  if (ahead >= 2 * DAY) return `${Math.floor(ahead / DAY)} days early`;
  if (ahead >= DAY) return 'a day early';
  if (ahead >= 2 * HOUR) return `with ${Math.floor(ahead / HOUR)} hours to spare`;
  return 'right before the deadline';
}

function stakeLine(kept: Kept): { text: string; emphasis: string[] } {
  const { stake } = kept;
  switch (stake?.kind) {
    case 'money': {
      const amount = formatCents(stake.amountCents);
      return { text: `${amount} stayed on your card.`, emphasis: [amount] };
    }
    case 'friend':
      return {
        text: `${stake.friendName} never had to hear a thing.`,
        emphasis: [stake.friendName],
      };
    case 'lockout':
      return { text: 'Not one freeze.', emphasis: [] };
    case undefined:
      return { text: 'Nothing was riding on it but your word, and you kept it.', emphasis: [] };
  }
}

export function keptStory(kept: Kept): KeptStory {
  const stake = stakeLine(kept);

  if (kept.kind === 'goal' || kept.run === undefined) {
    const when =
      kept.dueAt === undefined
        ? ''
        : ` by ${dueFormat.format(new Date(kept.dueAt))}, ${howEarly(kept.dueAt, kept.achievedAt)}`;
    return {
      kicker: 'Done',
      headline: { kind: 'words', text: 'Done.' },
      line: `You proved ${kept.title}${when}.`,
      emphasis: [kept.title, ...stake.emphasis],
      stakeLine: stake.text,
      dots: null,
      note: 'Proof’s in. Nobody can take this one back.',
    };
  }

  const { run } = kept;
  const daily = run.timesPerWeek >= DAILY;
  // A run with nothing in a row still counts its logs.
  const count = run.streak > 0 ? run.streak : run.completions;
  const unit = run.streak > 0 ? run.unit : 'log';
  const cadence = daily ? '' : `, ${run.timesPerWeek} a week`;

  return {
    kicker: 'Kept',
    headline: { kind: 'count', count, unit: `${unit}${count === 1 ? '' : 's'}` },
    line: `You kept ${kept.title} going for ${plural(count, unit)}${cadence}, right to the last day.`,
    emphasis: [kept.title, ...stake.emphasis],
    stakeLine: stake.text,
    dots: run.streak > 0 ? { count: run.streak, unit: run.unit } : null,
    note: 'Most people quit when it stops being new. You finished on your terms.',
  };
}
