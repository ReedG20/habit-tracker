import { StyleSheet, View } from 'react-native';

import { SegmentedPicker } from '@/components/segmented-picker';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { setAiConsent, useAiConsent, type AiConsent } from '@/lib/ai-consent';
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

const aiOptions: { value: AiConsent; label: string }[] = [
  { value: 'granted', label: 'On' },
  { value: 'declined', label: 'Off' },
];

export default function PreferencesScreen() {
  const themePreference = useThemePreference();
  // Unanswered reads as off: nothing has been sent.
  const aiConsent = useAiConsent() ?? 'declined';

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

      <View style={styles.field}>
        <ThemedText type="small" themeColor="textSecondary">
          AI checks
        </ThemedText>
        <SegmentedPicker options={aiOptions} value={aiConsent} onChange={setAiConsent} />
        <ThemedText type="small" themeColor="textSecondary">
          Sends your commitment names, proof photos and check-in places to Google’s Gemini AI, via
          OpenRouter, to suggest ideas and check proof. Off means photo and location proof can’t be
          checked.
        </ThemedText>
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
