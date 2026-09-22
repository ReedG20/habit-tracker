/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

import { sectionHeadingFontFamily, wisdomFontFamily } from '@/constants/custom-fonts';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    border: '#DDDDE3',
    accent: '#FF391F',
    accentElement: '#FFF0E6',
    primary: '#4121FF',
    onPrimary: '#ffffff',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    border: '#2E3135',
    accent: '#FF391F',
    accentElement: '#2C1C11',
    primary: '#4121FF',
    onPrimary: '#ffffff',
  },
} as const;

/** Inputs, icon tiles, and other small surfaces. */
export const BorderRadius = 16;

/** Cards, stat tiles, and grouped lists. */
export const CardRadius = 24;

/** Buttons and pills are capsules; liquid glass reads best that way. */
export const PillRadius = 999;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

const systemFonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Loaded via expo-font in the root layout; same family name on iOS, Android, and web. */
export const Fonts = {
  ...systemFonts,
  wisdom: wisdomFontFamily,
  sectionHeading: sectionHeadingFontFamily,
};

/** Top-of-screen title on Home and Me (Comico). */
export const ScreenHeadingTypography = {
  fontFamily: Fonts.wisdom,
  fontSize: 32,
  lineHeight: 40,
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** A regular-size button: SwiftUI's `.large` glass capsule, matched by `GlassButton`. */
export const ButtonHeight = 48;

/**
 * Cards with a button in their top-right corner. The corner is concentric
 * with the capsule inside it: the button's radius plus the card's padding.
 */
export const ActionCardRadius = ButtonHeight / 2 + Spacing.three;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
