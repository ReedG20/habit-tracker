import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A card's stake, as a capsule beside its meta: "$25 on it", "Sam’s
 * watching". In the accent while it's riding on the commitment; grey once
 * it's settled, or while nothing is being checked.
 */
export function StakePill({ text, live }: { text: string; live: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: live ? theme.accentElement : theme.background }]}>
      <ThemedText
        type="smallSemibold"
        themeColor={live ? 'accent' : 'textSecondary'}
        accessibilityLabel={`On the line: ${text}`}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: PillRadius,
  },
});
