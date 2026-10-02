import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AnteWordmark } from './ante-wordmark';
import { ProBadge } from './pro-badge';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AnteProLockupProps = {
  /** The wordmark's height; the badge stays one size. */
  size?: number;
  /** `inverse` sets it in white on a violet surface. */
  tone?: 'primary' | 'inverse';
  style?: StyleProp<ViewStyle>;
};

/** "Ante PRO": how the subscription is named wherever it's a title. */
export function AnteProLockup({ size = 22, tone = 'primary', style }: AnteProLockupProps) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Ante Pro"
      style={[styles.lockup, style]}>
      <AnteWordmark
        height={size}
        color={tone === 'inverse' ? theme.onPrimary : theme.text}
        accessible={false}
      />
      <ProBadge tone={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
