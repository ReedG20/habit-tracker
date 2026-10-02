import { StyleSheet, Text, View } from 'react-native';

import { PillRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ProBadgeProps = {
  /** `primary` on the app's own surfaces; `inverse` on a violet one. */
  tone?: 'primary' | 'inverse';
};

/**
 * The small "PRO" capsule: beside a subscriber's name, and after the wordmark
 * wherever Ante Pro is named. Text only; an icon this small reads as a hairline.
 */
export function ProBadge({ tone = 'primary' }: ProBadgeProps) {
  const theme = useTheme();
  const fill = tone === 'primary' ? theme.primary : theme.onPrimary;
  const ink = tone === 'primary' ? theme.onPrimary : theme.primary;

  return (
    <View
      accessible
      accessibilityLabel="Ante Pro"
      style={[styles.badge, { backgroundColor: fill }]}>
      <Text style={[styles.label, { color: ink }]}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: PillRadius,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
