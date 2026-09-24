import type { IconSvgElement } from '@hugeicons/react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { CheckmarkCircle02Icon } from '@/constants/icons';
import { BorderRadius, CardRadius, PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChoiceCardProps = {
  title: string;
  detail?: string;
  icon?: IconSvgElement;
  /** A short chip beside the title, e.g. "Suggested". */
  badge?: string;
  selected: boolean;
  onPress: () => void;
};

/** One option of a single-choice question: the paywall's `PlanCard` radio, generalised. */
export function ChoiceCard({ title, detail, icon, badge, selected, onPress }: ChoiceCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={detail !== undefined ? `${title}, ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      {icon !== undefined ? (
        <View style={[styles.iconTile, { backgroundColor: theme.background }]}>
          <Icon icon={icon} size={22} themeColor={selected ? 'primary' : 'text'} />
        </View>
      ) : null}
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <ThemedText type="smallBold">{title}</ThemedText>
          {badge !== undefined ? (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallSemibold" themeColor="onPrimary" style={styles.badgeText}>
                {badge}
              </ThemedText>
            </View>
          ) : null}
        </View>
        {detail !== undefined ? (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        ) : null}
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
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius,
    alignItems: 'center',
    justifyContent: 'center',
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
