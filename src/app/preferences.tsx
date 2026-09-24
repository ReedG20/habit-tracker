import { StyleSheet, View } from 'react-native';

import { ThemePicker } from '@/components/theme-picker';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { setThemePreference, useThemePreference } from '@/lib/theme-preference';

export default function PreferencesScreen() {
  const themePreference = useThemePreference();

  return (
    <View style={styles.sheet}>
      <ThemedText style={styles.title} themeColor="text">
        Preferences
      </ThemedText>

      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          Appearance
        </ThemedText>
        <ThemePicker value={themePreference} onChange={setThemePreference} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
  },
  field: {
    gap: Spacing.two,
  },
});
