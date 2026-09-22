import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { CheckmarkCircle02Icon } from '@/constants/icons';
import { CardRadius, PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PlanCardProps = {
  title: string;
  priceLine: string;
  subline?: string;
  /** A short chip in the corner, e.g. "7-day free trial". */
  badge?: string;
  selected: boolean;
  onPress: () => void;
};

/** One selectable plan in the paywall; a radio, not a button. */
export function PlanCard({ title, priceLine, subline, badge, selected, onPress }: PlanCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${priceLine}${subline ? `, ${subline}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <ThemedText type="smallBold">{title}</ThemedText>
          {badge !== undefined && (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallSemibold" themeColor="onPrimary" style={styles.badgeText}>
                {badge}
              </ThemedText>
            </View>
          )}
        </View>
        <ThemedText>{priceLine}</ThemedText>
        {subline !== undefined && (
          <ThemedText type="small" themeColor="textSecondary">
            {subline}
          </ThemedText>
        )}
      </View>
      <Icon
        icon={CheckmarkCircle02Icon}
        size={24}
        themeColor={selected ? 'primary' : 'border'}
        strokeWidth={selected ? 2 : 1.5}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: CardRadius,
    borderWidth: 2,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: PillRadius,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
