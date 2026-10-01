import type { IconSvgElement } from '@hugeicons/react-native';
import { Linking, Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ArrowRight01Icon, Book02Icon, LockIcon, Mail01Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { contactSupport, PRIVACY_URL, TERMS_URL } from '@/lib/support';

const rows: { id: string; label: string; icon: IconSvgElement; onPress: () => void }[] = [
  {
    id: 'support',
    label: 'Contact support',
    icon: Mail01Icon,
    onPress: () => void contactSupport(),
  },
  { id: 'terms', label: 'Terms', icon: Book02Icon, onPress: () => void Linking.openURL(TERMS_URL) },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: LockIcon,
    onPress: () => void Linking.openURL(PRIVACY_URL),
  },
];

/** Me's way to a person, and the legal pages. Styled like the settings card above it. */
export function HelpCard() {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      {rows.map((row, index) => (
        <Pressable
          key={row.id}
          accessibilityRole={row.id === 'support' ? 'button' : 'link'}
          onPress={row.onPress}
          style={({ pressed }) => [
            styles.row,
            index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <Icon icon={row.icon} size={22} themeColor="textSecondary" />
          <ThemedText style={styles.label}>{row.label}</ThemedText>
          <Icon icon={ArrowRight01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
        </Pressable>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  label: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
