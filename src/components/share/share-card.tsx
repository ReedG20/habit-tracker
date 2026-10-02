import { Image } from 'expo-image';
import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AnteWordmark } from '@/components/brand/ante-wordmark';
import { Icon } from '@/components/icon';
import { commitmentIcon } from '@/constants/commitment-icons';
import { titleFontFamily } from '@/constants/custom-fonts';
import { FlameIcon } from '@/constants/icons';
import { RING_PATH } from '@/constants/ring-path';
import { Fonts, Spacing } from '@/constants/theme';
import type { ShareSubject } from '@/convex/share';
import type { ShareCardKind, ShareCopy } from '@/data/share-copy';
import { SHARE_DISPLAY_URL } from '@/lib/share-links';

/**
 * The image a share posts: a 9:16 story card, laid out at a fixed 360 × 640
 * and captured at 1080 × 1920. It never follows the device theme, so a post
 * looks the same whoever made it. Each kind has its own look: the stake on
 * contract paper, a streak in the dark with the flame, a kept one in the
 * Kept screen's violet.
 */

export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 640;

type Palette = {
  background: string;
  text: string;
  soft: string;
  accent: string;
  panel: string;
  /** Rings the app icon where it would melt into the background. */
  logoBorder?: string;
};

const PALETTES: Record<ShareCardKind, Palette> = {
  // The signed contract's paper and ink.
  stake: {
    background: '#FBF8F1',
    text: '#1A1614',
    soft: '#8A7F78',
    accent: '#FF391F',
    panel: 'rgba(26, 22, 20, 0.06)',
  },
  streak: {
    background: '#000000',
    text: '#FFFFFF',
    soft: '#B0B4BA',
    accent: '#FF391F',
    panel: '#212225',
  },
  kept: {
    background: '#4121FF',
    text: '#FFFFFF',
    soft: 'rgba(255, 255, 255, 0.78)',
    accent: '#FFFFFF',
    panel: 'rgba(255, 255, 255, 0.12)',
    logoBorder: 'rgba(255, 255, 255, 0.6)',
  },
};

export type ShareCardProps = {
  card: ShareCardKind;
  subject: ShareSubject;
  copy: ShareCopy;
  ref?: Ref<View>;
};

export function ShareCard({ card, subject, copy, ref }: ShareCardProps) {
  const palette = PALETTES[card];

  return (
    // Not collapsable, so the capture has a native view to draw.
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { backgroundColor: palette.background }]}>
      <View style={styles.top}>
        <Text style={[styles.kicker, { color: palette.soft }]}>{copy.kicker.toUpperCase()}</Text>
        {card === 'kept' ? (
          <View style={[styles.stamp, { borderColor: palette.text }]}>
            <Text style={[styles.stampText, { color: palette.text }]}>KEPT</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.middle}>
        <Hero card={card} copy={copy} palette={palette} />
        <Text style={[styles.line, { color: palette.text }]}>{copy.line}</Text>

        <View style={[styles.panel, { backgroundColor: palette.panel }]}>
          <View style={[styles.iconTile, { backgroundColor: palette.background }]}>
            <Icon
              icon={commitmentIcon(subject.icon, subject.commitment)}
              size={24}
              strokeWidth={2}
              color={palette.text}
            />
          </View>
          <View style={styles.panelText}>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={2}>
              {subject.title}
            </Text>
            <Text style={[styles.cadence, { color: palette.soft }]} numberOfLines={1}>
              {copy.cadence}
            </Text>
          </View>
        </View>

        {/* The stake card's hero already says what's riding on it. */}
        {card === 'stake' ? null : (
          <Text style={[styles.stakeLine, { color: palette.text }]}>{copy.stakeLine}</Text>
        )}
        <Text style={[styles.note, { color: palette.soft }]}>{copy.note}</Text>
      </View>

      <View style={styles.footer}>
        <Image
          source={require('@/assets/brand/ante-background.svg')}
          style={[
            styles.logo,
            palette.logoBorder !== undefined && {
              borderWidth: 1.5,
              borderColor: palette.logoBorder,
            },
          ]}
          contentFit="contain"
          accessible={false}
        />
        <View style={styles.brand}>
          <AnteWordmark height={16} color={palette.text} style={styles.brandName} />
          <Text style={[styles.brandLine, { color: palette.soft }]}>habits with stakes</Text>
        </View>
        <Text style={[styles.url, { color: palette.text }]}>{SHARE_DISPLAY_URL}</Text>
      </View>
    </View>
  );
}

function Hero({ card, copy, palette }: { card: ShareCardKind; copy: ShareCopy; palette: Palette }) {
  if (card === 'streak') {
    return (
      <View style={styles.heroRow}>
        <Icon icon={FlameIcon} size={64} strokeWidth={2} color={palette.accent} />
        <View>
          <Text style={[styles.count, { color: palette.text }]} numberOfLines={1}>
            {copy.hero}
          </Text>
          <Text style={[styles.unit, { color: palette.text }]}>{copy.heroUnit}</Text>
        </View>
      </View>
    );
  }

  if (card === 'kept') {
    return (
      <View style={styles.keptHero}>
        <View style={styles.ringed}>
          <Text
            style={[
              copy.heroUnit === undefined ? styles.words : styles.count,
              { color: palette.text },
            ]}
            numberOfLines={1}>
            {copy.hero}
          </Text>
          <Svg style={styles.ring} viewBox="0 0 200 100" preserveAspectRatio="none">
            <Path
              d={RING_PATH}
              stroke={palette.text}
              strokeWidth={4}
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </Svg>
        </View>
        {copy.heroUnit === undefined ? null : (
          <Text style={[styles.unit, { color: palette.text }]}>{copy.heroUnit}</Text>
        )}
      </View>
    );
  }

  const fontSize = stakeHeroSize(copy.hero);
  return (
    <Text
      style={[
        styles.stakeHero,
        { color: palette.accent, fontSize, lineHeight: Math.round(fontSize * 1.24) },
      ]}>
      {copy.hero}
    </Text>
  );
}

/** Comico's capitals run about this wide, as a share of the font size. */
const COMICO_CHAR_WIDTH = 0.6;
const STAKE_HERO_MAX = 84;
const HERO_WIDTH = SHARE_CARD_WIDTH - 2 * (Spacing.four + Spacing.one);

/**
 * As big as the longest word allows, so "$250" and "3 days locked" both fill
 * the card without a word breaking. Sized here rather than with
 * `adjustsFontSizeToFit`, which shrinks it to nothing inside the share
 * sheet's scaled-down preview.
 */
function stakeHeroSize(text: string): number {
  const longest = Math.max(...text.split(' ').map((word) => word.length));
  return Math.min(STAKE_HERO_MAX, Math.floor(HERO_WIDTH / (longest * COMICO_CHAR_WIDTH)));
}

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    paddingHorizontal: Spacing.four + Spacing.one,
    paddingTop: Spacing.five + Spacing.three,
    paddingBottom: Spacing.five,
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  stamp: {
    borderWidth: 3,
    borderRadius: 10,
    paddingHorizontal: Spacing.two + Spacing.half,
    transform: [{ rotate: '-8deg' }],
  },
  // Comico sits high in its line box: a tall box keeps it from clipping.
  stampText: {
    fontFamily: Fonts.wisdom,
    fontSize: 22,
    lineHeight: 32,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  // Its size comes from `stakeHeroSize`.
  stakeHero: {
    fontFamily: Fonts.wisdom,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  keptHero: {
    gap: Spacing.half,
  },
  ringed: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.one,
    marginLeft: -Spacing.three,
  },
  ring: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  count: {
    fontFamily: Fonts.wisdom,
    fontSize: 96,
    lineHeight: 118,
  },
  words: {
    fontFamily: Fonts.wisdom,
    fontSize: 72,
    lineHeight: 96,
  },
  unit: {
    fontFamily: Fonts.wisdom,
    fontSize: 26,
    lineHeight: 34,
  },
  line: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '600',
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 24,
    padding: Spacing.three,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelText: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontFamily: titleFontFamily,
    fontSize: 19,
    lineHeight: 24,
  },
  cadence: {
    fontSize: 14,
    fontWeight: '600',
  },
  stakeLine: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  note: {
    fontFamily: Fonts.note,
    fontSize: 21,
    lineHeight: 30,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.half,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  brand: {
    flex: 1,
  },
  // Takes the line box the name had in text, so the tagline doesn't move.
  brandName: {
    marginVertical: Spacing.one,
  },
  brandLine: {
    fontSize: 12,
    fontWeight: '600',
  },
  url: {
    fontSize: 13,
    fontWeight: '700',
  },
});
