import type { IconSvgElement } from '@hugeicons/react-native';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import {
  Add01Icon,
  GoalListIcon,
  HabitIcon,
  LockKeyholeIcon,
  SparklesIcon,
} from '@/constants/icons';
import { CardRadius, Spacing, type ThemeColor } from '@/constants/theme';
import { proLockLedger, type ProLockInput, type ProLockRow } from '@/data/pro-lock';
import { useTheme } from '@/hooks/use-theme';
import type { PaywallSource } from '@/lib/analytics-events';
import { openPaywall } from '@/lib/paywall';

export type ProLockCardProps = ProLockInput & {
  /** Where it sits, for the paywall's analytics. */
  source: PaywallSource;
};

/** Goals are the one live row: they can still settle, so they keep the accent. */
const ROW_ICONS: Record<ProLockRow['id'], { icon: IconSvgElement; color: ThemeColor }> = {
  habits: { icon: HabitIcon, color: 'textSecondary' },
  goals: { icon: GoalListIcon, color: 'accent' },
  new: { icon: Add01Icon, color: 'textSecondary' },
};

/**
 * Without Ante Pro, a ledger of where things stand: what's paused, what still
 * runs, and that nothing new can start. Not dismissable; it goes away when Pro
 * comes back.
 */
export function ProLockCard({ source, ...input }: ProLockCardProps) {
  const theme = useTheme();
  const ledger = proLockLedger(input);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.heading}>
        <Icon icon={LockKeyholeIcon} size={20} strokeWidth={2} themeColor="primary" />
        <ThemedText type="smallSemibold" themeColor="primary" style={styles.headingText}>
          {ledger.title}
        </ThemedText>
        <ActionButton
          label={ledger.actionLabel}
          icon={SparklesIcon}
          variant="primary"
          size="small"
          onPress={() => openPaywall(source)}
        />
      </View>

      <View style={[styles.rows, { borderColor: theme.border }]}>
        {ledger.rows.map((row, index) => (
          <View
            key={row.id}
            style={[
              styles.row,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
            ]}>
            <Icon
              icon={ROW_ICONS[row.id].icon}
              size={20}
              strokeWidth={2}
              themeColor={ROW_ICONS[row.id].color}
            />
            <ThemedText type="smallSemibold" themeColor="text" style={styles.rowLabel}>
              {row.label}
            </ThemedText>
            <ThemedText
              type={row.id === 'goals' ? 'smallSemibold' : 'small'}
              themeColor={ROW_ICONS[row.id].color}>
              {row.status}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: CardRadius,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
    gap: Spacing.three,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headingText: {
    flex: 1,
  },
  rows: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
    paddingVertical: Spacing.two + Spacing.one,
  },
  rowLabel: {
    flex: 1,
  },
});
