import type { IconSvgElement } from '@hugeicons/react-native';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Camera01Icon, Location01Icon, Timer02Icon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ProofMethod = {
  key: string;
  label: string;
  hint: string;
  icon: IconSvgElement;
  available: boolean;
};

const methods: ProofMethod[] = [
  { key: 'photo', label: 'Photo', hint: 'AI checks it', icon: Camera01Icon, available: true },
  { key: 'location', label: 'Location', hint: 'be there', icon: Location01Icon, available: false },
  { key: 'timer', label: 'Timer', hint: 'phone down', icon: Timer02Icon, available: false },
];

/**
 * Photo is the only proof the backend checks today, so it is always the
 * selection; the others are shown so people know what's coming.
 */
export function ProofMethodPicker() {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        How will you prove it?
      </ThemedText>
      <View style={styles.row} accessibilityRole="radiogroup">
        {methods.map((method) => {
          const selected = method.available;

          return (
            <View
              key={method.key}
              accessible
              accessibilityRole="radio"
              accessibilityLabel={`${method.label}, ${method.hint}${method.available ? '' : ', coming soon'}`}
              accessibilityState={{ selected, disabled: !method.available }}
              style={[
                styles.card,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: selected ? theme.primary : 'transparent',
                },
                !method.available && styles.unavailable,
              ]}>
              <View style={styles.labelRow}>
                <Icon
                  icon={method.icon}
                  size={20}
                  strokeWidth={2}
                  themeColor={selected ? 'primary' : 'textSecondary'}
                />
                <ThemedText type="smallBold" themeColor="text" numberOfLines={1}>
                  {method.label}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {method.available ? method.hint : 'soon'}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  // Icon beside the label, so the row stays short enough for the step to fit one screen.
  card: {
    flex: 1,
    gap: Spacing.half,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: BorderRadius,
    borderWidth: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  unavailable: {
    opacity: 0.45,
  },
});
