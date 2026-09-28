import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { CheckmarkCircle02Icon, NotificationOff01Icon } from '@/constants/icons';
import { CardRadius, PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requestPermission, type PushPermission } from '@/lib/notifications';

/**
 * Whether this phone will actually show reminders. Everything else on the
 * Reminders screen is moot while iOS says no, so that comes first and says so.
 */
export function NotificationsStatusCard({ permission }: { permission: PushPermission | null }) {
  const theme = useTheme();
  if (permission === null) return null;

  if (permission === 'granted' || permission === 'provisional') {
    return (
      <View style={[styles.onPill, { backgroundColor: theme.backgroundElement }]}>
        <Icon icon={CheckmarkCircle02Icon} size={20} strokeWidth={2} themeColor="primary" />
        <ThemedText type="small" themeColor="textSecondary">
          On for this phone
        </ThemedText>
      </View>
    );
  }

  const denied = permission === 'denied';
  return (
    <View style={[styles.card, { backgroundColor: theme.accentElement }]}>
      <View style={styles.heading}>
        <Icon icon={NotificationOff01Icon} size={22} themeColor="accent" />
        <ThemedText type="smallSemibold" themeColor="text" style={styles.headingText}>
          Reminders can’t reach you
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="text">
        {denied
          ? 'Notifications are off for Ante in Settings.'
          : 'Let Ante send notifications so a deadline never sneaks past.'}
      </ThemedText>
      <ActionButton
        label={denied ? 'Open Settings' : 'Turn on'}
        variant="primary"
        size="small"
        onPress={() => {
          void requestPermission().catch((error: unknown) => {
            console.warn('Could not ask for notifications', error);
          });
        }}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  onPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one + Spacing.half,
    borderRadius: PillRadius,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.half,
  },
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
  button: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
});
