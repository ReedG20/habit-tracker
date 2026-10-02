import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { INK_DARK } from '@/components/today-hero';
import { ArrowRight01Icon } from '@/constants/icons';
import { CardRadius, Fonts, Spacing } from '@/constants/theme';
import type { StakeView } from '@/convex/lib/stakeRules';
import { stakeStrip, type StakeStripOptions } from '@/data/stake-strip';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { openLoss } from '@/lib/loss-screen';

const ICON_TILE = 32;

export type StakeStripProps = StakeStripOptions & {
  stake: StakeView | null;
};

/**
 * What's on the line, right under a commitment's title, so it's the first
 * thing read: a big figure, what it is, and what that means. One that came
 * due opens its loss screen.
 */
export function StakeStrip({ stake, ...options }: StakeStripProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const strip = stakeStrip(stake, options);
  if (strip === null || stake === null) return null;

  // Brand violet lightens on black so it stays readable, as on Today.
  const kept = scheme === 'dark' ? INK_DARK : theme.primary;
  const figureColor = {
    live: theme.accent,
    lost: theme.accent,
    kept,
    quiet: theme.textSecondary,
  }[strip.tone];
  const live = strip.tone === 'live';
  const lossId = stake.lostAt === undefined ? undefined : stake._id;

  const content = (
    <>
      <View
        style={[
          styles.iconTile,
          { backgroundColor: live ? theme.background : theme.backgroundSelected },
        ]}>
        <Icon icon={strip.icon} size={18} strokeWidth={2} color={figureColor} />
      </View>
      <View style={styles.body}>
        <View style={styles.headline}>
          <View style={styles.figureBox}>
            <Text numberOfLines={1} style={[styles.figure, { color: figureColor }]}>
              {strip.figure}
            </Text>
            {/* Drawn, not `line-through`: the display font's own strike sits low on its glyphs. */}
            {strip.struck ? (
              <View style={[styles.strike, { backgroundColor: figureColor }]} />
            ) : null}
          </View>
          <ThemedText
            type="smallSemibold"
            style={{ color: live ? theme.accent : theme.textSecondary }}>
            {strip.label}
          </ThemedText>
        </View>
        {strip.note === undefined ? null : (
          <ThemedText type="small" themeColor="textSecondary">
            {strip.note}
          </ThemedText>
        )}
      </View>
      {lossId === undefined ? null : (
        <Icon icon={ArrowRight01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
      )}
    </>
  );

  const label = [`${strip.figure} ${strip.label}`, strip.note].filter(Boolean).join('. ');
  const surface = [
    styles.strip,
    { backgroundColor: live ? theme.accentElement : theme.backgroundElement },
  ];

  if (lossId === undefined) {
    return (
      <View accessible accessibilityLabel={label} style={surface}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens what the miss cost"
      onPress={() => openLoss(lossId)}
      style={({ pressed }) => [...surface, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: CardRadius,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.one,
  },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: ICON_TILE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  // The figure and what it is, on one baseline: "$25 on the line".
  headline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
  },
  figure: {
    fontFamily: Fonts.wisdom,
    fontSize: 28,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  figureBox: {
    flexShrink: 1,
  },
  // Through the middle of the digits, which sit high in the line box.
  strike: {
    position: 'absolute',
    left: -Spacing.half,
    right: -Spacing.half,
    top: '44%',
    height: 2.5,
    borderRadius: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
