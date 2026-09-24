import { StyleSheet, View } from 'react-native';

import { SegmentedPicker } from '@/components/segmented-picker';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from '@/lib/theme-preference';

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

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
        <SegmentedPicker
          options={themeOptions}
          value={themePreference}
          onChange={setThemePreference}
        />
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
