import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Camera01Icon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Mirrors `MAX_SUBMISSION_PHOTOS` on the server. */
const MAX_PHOTOS = 6;

/**
 * Goals are proven once, at the end, so there is no method to pick: this says
 * how that works instead, where habits show `ProofMethodPicker`.
 */
export function GoalProofExplainer() {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        How will you prove it?
      </ThemedText>
      <View accessible style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Icon icon={Camera01Icon} size={24} themeColor="primary" />
        <View style={styles.body}>
          <ThemedText type="smallBold" themeColor="text">
            Photos of the finished result
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            When it’s done, send up to {MAX_PHOTOS} photos before the deadline. AI checks them
            against what you write below. Not accepted? Try again until time runs out.
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: BorderRadius,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
});
