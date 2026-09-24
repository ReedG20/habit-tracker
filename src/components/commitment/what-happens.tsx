import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CardRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type WhatHappensProps = {
  steps: string[];
};

/** "Exactly what happens": the consequences, numbered, with nothing left to fine print. */
export function WhatHappens({ steps }: WhatHappensProps) {
  const theme = useTheme();

  return (
    <View style={[styles.panel, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallSemibold" themeColor="textSecondary">
        Exactly what happens
      </ThemedText>
      {steps.map((step, index) => (
        <View key={index} style={styles.row}>
          <View style={[styles.number, { borderColor: theme.textSecondary }]}>
            <ThemedText type="smallBold" themeColor="text">
              {index + 1}
            </ThemedText>
          </View>
          <ThemedText style={styles.text} themeColor="text">
            {step}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  number: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
