import { StyleSheet, View } from 'react-native';

import type { WordingRevision } from './use-wording-check';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Alert02Icon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A small `ActionButton` (SwiftUI's regular glass capsule), as drawn on iOS 26+. */
const SMALL_BUTTON_HEIGHT = 32;

// One level of nesting, so the curve never compounds: the card's corner is
// concentric with the "Use this" capsule sitting in it, and the quoted
// suggestion is inset by the same padding, so it follows the card's curve.
const CARD_RADIUS = SMALL_BUTTON_HEIGHT / 2 + Spacing.three;
const SUGGESTION_RADIUS = CARD_RADIUS - Spacing.three;

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
        <Icon icon={Alert02Icon} size={20} strokeWidth={2} themeColor="accent" />
        <ThemedText type="smallBold" themeColor="text">
          Make it provable
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="text">
        {revision.feedback ||
          'Make it specific enough that one photo could clearly show you did it.'}
      </ThemedText>

      {suggestion !== null ? (
        <>
          <View style={[styles.suggestion, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold" themeColor="text">
              {suggestion.title}
            </ThemedText>
            {suggestion.proof.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {suggestion.proof}
              </ThemedText>
            ) : null}
          </View>
          <ActionButton
            label="Use this"
            size="small"
            variant="primary"
            accessibilityLabel={
              suggestion.proof.length > 0
                ? `Use the suggestion: ${suggestion.title}, proven by ${suggestion.proof}`
                : `Use the suggestion: ${suggestion.title}`
            }
            onPress={() => onUseSuggestion(suggestion)}
            style={styles.use}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: CARD_RADIUS,
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
    borderRadius: SUGGESTION_RADIUS,
  },
  use: {
    alignSelf: 'flex-start',
  },
});
