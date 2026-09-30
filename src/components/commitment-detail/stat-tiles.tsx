import type { IconSvgElement } from '@hugeicons/react-native';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Stat = {
  key: string;
  value: string;
  label: string;
  /** Drawn in the accent beside the value (the streak's flame). */
  icon?: IconSvgElement;
};

/** A row of big numbers, each over what it counts. */
export function StatTiles({ stats }: { stats: Stat[] }) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {stats.map((stat) => (
        <ThemedView
          key={stat.key}
          type="backgroundElement"
          accessible
          accessibilityLabel={`${stat.label}: ${stat.value}`}
          style={styles.tile}>
          <View style={styles.valueRow}>
            {stat.icon === undefined ? null : (
              <Icon icon={stat.icon} size={22} color={theme.accent} fill={theme.accent} />
            )}
            <ThemedText style={styles.value} themeColor="text" numberOfLines={1}>
              {stat.value}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {stat.label}
          </ThemedText>
        </ThemedView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  value: ScreenHeadingTypography,
});
