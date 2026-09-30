import type { IconSvgElement } from '@hugeicons/react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AlsoTicker } from './also-ticker';
import { Note } from './commitment/note';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

import {
  Calendar03Icon,
  CheckmarkCircle02Icon,
  CoinsDollarIcon,
  FlameIcon,
  GoalListIcon,
  LockIcon,
  Timer02Icon,
} from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { formatStreak } from '@/data/habits';
import {
  splitEmphasis,
  type MomentFigure,
  type MomentKind,
  type TodayMoment,
} from '@/data/today-moment';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCountUp } from '@/hooks/use-count-up';
import { useForegroundCount } from '@/hooks/use-foreground-count';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic } from '@/lib/haptics';

export type TodayHeroProps = {
  moment: TodayMoment;
};

/** Brand violet reads too dark as thin text on black; this is its dark-mode ink. */
export const INK_DARK = '#9F8CFF';

/** The corner the note gets; two short handwritten lines. */
const NOTE_WIDTH = 150;

/** One glyph per kind of argument: the clock, the run, the lock, the money. */
function kickerIcon(moment: TodayMoment): IconSvgElement {
  const byKind: Record<MomentKind, IconSvgElement> = {
    retake: Timer02Icon,
    goalCrunch: Timer02Icon,
    lastCall: Timer02Icon,
    goalToday: GoalListIcon,
    streak: FlameIcon,
    frozen: LockIcon,
    stakes: moment.figure?.kind === 'money' ? CoinsDollarIcon : Timer02Icon,
    clear:
      moment.tone === 'done'
        ? CheckmarkCircle02Icon
        : moment.figure?.kind === 'tally'
          ? Calendar03Icon
          : GoalListIcon,
  };
  return byKind[moment.kind];
}

/** What the figure finally reads, for VoiceOver and the end of the count-up. */
function figureText(figure: MomentFigure): string {
  switch (figure.kind) {
    case 'money':
    case 'time':
    case 'tally':
      return figure.text;
    case 'streak':
      return formatStreak(figure.streak);
  }
}

/** Formats a value partway through the count-up the way the final figure reads. */
function formatter(figure: MomentFigure): (value: number) => string {
  if (figure.kind === 'streak') {
    return (value) => formatStreak({ count: Math.round(value), unit: figure.streak.unit });
  }
  if (figure.kind === 'money' && figure.currency !== undefined) {
    const format = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: figure.currency,
    });
    return (value) => format.format(value);
  }
  const decimals = figure.kind === 'money' && figure.amount % 1 !== 0 ? 2 : 0;
  return (value) => `$${value.toFixed(decimals)}`;
}

/**
 * Digits big, everything else (currency, units) small on the same baseline:
 * "23 days" reads as a number first, and the figure leaves room beside it.
 */
function FigureText({ text, color }: { text: string; color: string }) {
  const parts = text.match(/[\d.,:]+|[^\d.,:]+/g) ?? [text];
  // A leading currency sign rides high, like a price tag; trailing units sit
  // on the baseline next to the digits.
  const prefix = parts.length > 1 && !/\d/.test(parts[0]) ? parts[0].trim() : null;
  const rest = prefix === null ? parts : parts.slice(1);
  // "12 weeks", "1h 20m" and "CA$12.99" step down a size so the note still
  // fits beside them; "$9.99" and "23 days" have the room.
  const compact = text.replace(/\s/g, '');
  const digits = compact.replace(/\D/g, '').length;
  const wide = compact.length > 6 || (digits >= 3 && /[a-z]/i.test(compact));
  return (
    <View style={styles.figureParts}>
      {prefix === null ? null : (
        <Text style={[styles.prefix, wide && styles.prefixWide, { color }]}>{prefix}</Text>
      )}
      <Text style={[styles.figure, wide && styles.figureWide, { color }]} numberOfLines={1}>
        {rest.map((part, index) => (
          <Text
            key={index}
            style={/\d/.test(part) ? undefined : wide ? styles.unitWide : styles.unit}>
            {part}
          </Text>
        ))}
      </Text>
    </View>
  );
}

type CountingFigureProps = {
  figure: Extract<MomentFigure, { kind: 'money' | 'streak' }>;
  replayKey: string;
  color: string;
};

function CountingFigure({ figure, replayKey, color }: CountingFigureProps) {
  const target = figure.kind === 'money' ? figure.amount : figure.streak.count;
  const value = useCountUp(target, replayKey);
  const settled = value === target;

  // A streak that grows while the screen is up just got earned: mark it.
  const last = useRef({ replayKey, target });
  useEffect(() => {
    const rose = last.current.replayKey === replayKey && target > last.current.target;
    last.current = { replayKey, target };
    if (rose && figure.kind === 'streak') successHaptic();
  }, [replayKey, target, figure.kind]);

  return (
    <FigureText text={settled ? figureText(figure) : formatter(figure)(value)} color={color} />
  );
}

/**
 * The top of Today: one moment picked from where the user stands (see
 * `pickTodayMoment`). A small kicker names the argument, a big figure makes
 * it and the caption right under it says what it is; the coach adds a
 * handwritten P.S., and the rest of the stakes rotate in the capsule.
 */
export function TodayHero({ moment }: TodayHeroProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  // Replays the count-up when the app comes back, not on every tab switch.
  const foreground = useForegroundCount();
  const replayKey = `${foreground}:${moment.kind}`;
  const { figure, note } = moment;
  // Brand violet is the pen; on black it lightens so it stays readable.
  const ink = scheme === 'dark' ? INK_DARK : theme.primary;
  const toneColor = { urgent: theme.accent, normal: theme.textSecondary, done: ink }[moment.tone];
  const figureColor = moment.tone === 'urgent' ? theme.accent : theme.text;

  return (
    <View style={styles.hero}>
      <View
        accessible
        accessibilityLabel={[moment.kicker, figure && figureText(figure), moment.sentence, note]
          .filter(Boolean)
          .join(' ')}
        style={styles.story}>
        {/* The coach's scribble, pinned in the top corner and tilted the
            other way: it floats over the hero instead of joining its text. */}
        {note === null ? null : <Note style={[styles.note, { color: ink }]}>{note}</Note>}

        {/* A long kicker wraps short of the note rather than running under it. */}
        <View style={[styles.kicker, note !== null && styles.kickerBesideNote]}>
          {/* HugeIcons go thin when small: a touch bigger and bolder than the label. */}
          <Icon icon={kickerIcon(moment)} size={20} strokeWidth={2} color={toneColor} />
          <ThemedText type="smallSemibold" style={[styles.kickerText, { color: toneColor }]}>
            {moment.kicker}
          </ThemedText>
        </View>

        {/* The figure and its caption are one unit: nothing sits between them. */}
        {figure === null ? null : figure.kind === 'time' || figure.kind === 'tally' ? (
          <FigureText text={figure.text} color={figureColor} />
        ) : (
          <CountingFigure figure={figure} replayKey={replayKey} color={figureColor} />
        )}
        <ThemedText style={styles.caption} themeColor="text">
          {splitEmphasis(moment.sentence, moment.emphasis).map((run, index) =>
            run.bold ? (
              <Text key={index} style={styles.emphasis}>
                {run.text}
              </Text>
            ) : (
              run.text
            ),
          )}
        </ThemedText>
      </View>

      <AlsoTicker facts={moment.also} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignSelf: 'stretch',
    gap: Spacing.three,
  },
  story: {
    gap: Spacing.one,
  },
  kicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    marginBottom: Spacing.one,
  },
  kickerBesideNote: {
    paddingRight: NOTE_WIDTH + Spacing.two + Spacing.two,
  },
  kickerText: {
    flexShrink: 1,
  },
  // Comico sits high in its line box: a tight box clips the tops of the
  // digits, so the box stays tall and the margins even out the gaps instead.
  figureParts: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  prefix: {
    fontFamily: Fonts.wisdom,
    fontSize: 36,
    lineHeight: 44,
    marginTop: Spacing.two,
    marginRight: Spacing.half,
  },
  figure: {
    fontFamily: Fonts.wisdom,
    fontSize: 88,
    lineHeight: 104,
    // Pulls the caption up under the digits (it belongs to the number),
    // leaving a little air between them.
    marginBottom: -(Spacing.three + Spacing.half),
  },
  figureWide: {
    fontSize: 72,
    lineHeight: 88,
  },
  unit: {
    fontSize: 36,
  },
  unitWide: {
    fontSize: 30,
  },
  prefixWide: {
    fontSize: 30,
    lineHeight: 36,
  },
  note: {
    position: 'absolute',
    top: -(Spacing.three + Spacing.two),
    right: Spacing.two,
    width: NOTE_WIDTH,
    textAlign: 'right',
    transform: [{ rotate: '5deg' }],
    zIndex: 1,
  },
  // Held a little short of full width so it reads as a short caption, not body copy.
  caption: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 500,
    maxWidth: 250,
  },
  // The names, days and money in the caption: what the eye should catch.
  emphasis: {
    fontWeight: 700,
  },
});
