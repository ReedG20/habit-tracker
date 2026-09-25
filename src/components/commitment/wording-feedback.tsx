import { StyleSheet, View } from 'react-native';

import type { WordingRevision } from './use-wording-check';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Alert02Icon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type WordingFeedbackProps = {
  revision: WordingRevision;
  /** Fills the fields with the model's rewrite. */
  onUseSuggestion: (suggestion: { title: string; proof: string }) => void;
};

/**
 * Why the wording needs another pass, under the fields it is about. Proof is
 * judged against these words later, so this is the moment to make them provable.
 */
export function WordingFeedback({ revision, onUseSuggestion }: WordingFeedbackProps) {
  const theme = useTheme();
  const { suggestion } = revision;

  return (
    // No fade-in: the SwiftUI button's host measures itself mid-animation and
    // then draws over the text above it. Scrolling into view is motion enough.
    <View
      accessibilityLiveRegion="polite"
      style={[styles.card, { backgroundColor: theme.accentElement, borderColor: theme.accent }]}>
      <View style={styles.header}>
        <Icon icon={Alert02Icon} size={18} themeColor="accent" />
        <ThemedText type="smallBold" themeColor="text">
          Make it provable
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="text">
        {revision.feedback ||
          'Make it specific enough that one photo could clearly show you did it.'}
      </ThemedText>

      {suggestion !== null ? (
        <View style={[styles.suggestion, { backgroundColor: theme.background }]}>
          <ThemedText type="smallBold" themeColor="text">
            {suggestion.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {suggestion.proof}
          </ThemedText>
          <ActionButton
            label="Use this"
            size="small"
            variant="primary"
            accessibilityLabel={`Use the suggestion: ${suggestion.title}, proven by ${suggestion.proof}`}
            onPress={() => onUseSuggestion(suggestion)}
            style={styles.use}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: BorderRadius,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  suggestion: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: BorderRadius - Spacing.one,
  },
  use: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
});
