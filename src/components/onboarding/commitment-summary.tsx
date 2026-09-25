import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { GoalListIcon, HabitIcon } from '@/constants/icons';
import { ActionCardRadius, CardRadius, ControlHeight, Spacing } from '@/constants/theme';
import type { CommitmentDraft } from '@/components/commitment/draft';
import { frequencyLabel } from '@/convex/lib/frequency';
import { useTheme } from '@/hooks/use-theme';
import { formatDueAt } from '@/lib/dates';

/** The drafted commitment, drawn like a habit or goal card on the home screens. */
export function CommitmentSummary({ draft }: { draft: CommitmentDraft }) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.iconTile, { backgroundColor: theme.background }]}>
        <Icon
          icon={draft.kind === 'habit' ? HabitIcon : GoalListIcon}
          size={24}
          themeColor="text"
        />
      </View>
      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {draft.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {draft.kind === 'habit'
            ? frequencyLabel(draft.timesPerWeek)
            : `Due ${formatDueAt(draft.dueAt)}`}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: ActionCardRadius,
  },
  iconTile: {
    width: ControlHeight,
    height: ControlHeight,
    borderRadius: CardRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
