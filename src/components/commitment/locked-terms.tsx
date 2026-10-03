import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LockIcon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';

export type LockedTerm = { label: string; value: string };

/**
 * A commitment's signed terms, shown rather than edited once its call-off
 * window has closed (`convex/callOff.ts` `requireTermsOpen`): the proof is
 * judged against these words, so they run as signed.
 */
export function LockedTerms({ terms, note }: { terms: LockedTerm[]; note: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {terms.map((term) => (
        <View key={term.label} style={styles.term}>
          <ThemedText type="small" themeColor="textSecondary">
            {term.label}
          </ThemedText>
          <ThemedText>{term.value}</ThemedText>
        </View>
      ))}
      <View style={styles.note}>
        <Icon icon={LockIcon} size={20} strokeWidth={2} themeColor="textSecondary" />
        <ThemedText type="small" themeColor="textSecondary" style={styles.noteText}>
          {note}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  term: {
    gap: Spacing.half,
  },
  note: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
  },
});
