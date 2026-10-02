import { StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

import type { CommitmentKind } from '@/components/commitment/draft';
import { UndoIcon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import type { StakeView } from '@/convex/lib/stakeRules';
import { CALL_OFF_HEADING, callOffBody } from '@/data/call-off';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

export type CallOffBannerProps = {
  kind: CommitmentKind;
  title: string;
  /** When it can no longer be called off (`data/call-off.ts` `openCallOff`). */
  until: number;
  stake: StakeView | null;
  onChangeTerms: () => void;
  onCallOff: () => void;
};

/**
 * The detail screen's way back out, for the first little while after a
 * commitment is signed: until when, and the two things that can still be
 * done. It leaves on its own the moment the window closes.
 */
export function CallOffBanner({
  kind,
  title,
  until,
  stake,
  onChangeTerms,
  onCallOff,
}: CallOffBannerProps) {
  const theme = useTheme();
  // Finer than the screen's clock, so it doesn't linger past its time.
  const now = useNow(15_000);
  if (now >= until) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.accentElement }]}>
      <View style={styles.heading}>
        <Icon icon={UndoIcon} size={22} strokeWidth={2} themeColor="accent" />
        <ThemedText type="smallSemibold" themeColor="text" style={styles.headingText}>
          {CALL_OFF_HEADING}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="text">
        {callOffBody(kind, until, now, stake)}
      </ThemedText>

      <View style={styles.actions}>
        <ActionButton
          label="Change terms"
          accessibilityLabel={`Change the terms of ${title}`}
          size="small"
          onPress={onChangeTerms}
        />
        <ActionButton
          label="Call it off"
          accessibilityLabel={`Call off ${title}`}
          variant="destructive"
          size="small"
          onPress={onCallOff}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headingText: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
