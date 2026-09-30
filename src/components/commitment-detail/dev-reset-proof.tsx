import { useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { UndoIcon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { showDevTools } from '@/lib/dev-tools';
import { successHaptic } from '@/lib/haptics';
import { userErrorMessage } from '@/lib/user-errors';

export type DevResetProofProps = {
  /** Whether there's anything to undo (a log, or a check in any state). */
  visible: boolean;
  label: string;
  /** What the confirmation says goes away. */
  message: string;
  onReset: () => Promise<unknown>;
};

/**
 * Developer tool on a detail screen: undoes a proof so the method can be tried
 * again. Only in dev builds, and only where the deployment allows overrides;
 * dashed and tagged so it never passes for part of the real screen.
 */
export function DevResetProof({ visible, label, message, onReset }: DevResetProofProps) {
  const theme = useTheme();
  const devOverrides = useQuery(api.lockouts.devOverrides, showDevTools ? {} : 'skip');
  const [busy, setBusy] = useState(false);

  if (!showDevTools || devOverrides !== true || !visible) return null;

  const reset = () =>
    confirmDestructive({
      title: label,
      message,
      confirmLabel: 'Reset',
      onConfirm: () => {
        setBusy(true);
        onReset()
          .then(() => {
            successHaptic();
            showToast('Reset', 'Prove it again whenever you’re ready.', 'success');
          })
          .catch((error: unknown) => {
            showToast('Couldn’t reset it', userErrorMessage(error, 'Try again in a moment.'));
          })
          .finally(() => setBusy(false));
      },
    });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, developer tool`}
      disabled={busy}
      onPress={reset}
      style={({ pressed }) => [
        styles.row,
        { borderColor: theme.border },
        (pressed || busy) && styles.pressed,
      ]}>
      <Icon icon={UndoIcon} size={20} strokeWidth={2} themeColor="textSecondary" />
      <ThemedText type="smallSemibold" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      <View style={[styles.tag, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText themeColor="textSecondary" style={styles.tagText}>
          DEV
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  label: {
    flex: 1,
  },
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.6,
  },
});
