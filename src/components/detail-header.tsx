import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { ArrowLeft01Icon, Delete02Icon, Edit02Icon } from '@/constants/icons';
import { BorderRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type DetailHeaderProps = {
  title: string;
  description?: string;
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel: string;
};

/** Back row, heading, and the edit/delete pair shared by both detail screens. */
export function DetailHeader({
  title,
  description,
  onEdit,
  onDelete,
  deleteLabel,
}: DetailHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        hitSlop={Spacing.three}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Icon icon={ArrowLeft01Icon} size={18} themeColor="textSecondary" />
        <ThemedText type="small" themeColor="textSecondary">
          Back
        </ThemedText>
      </Pressable>

      <ThemedText style={styles.title} themeColor="text">
        {title}
      </ThemedText>

      {description ? <ThemedText themeColor="textSecondary">{description}</ThemedText> : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
          style={({ pressed }) => [
            styles.action,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <Icon icon={Edit02Icon} size={16} themeColor="textSecondary" />
          <ThemedText type="smallBold" themeColor="textSecondary">
            Edit
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.action,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <Icon icon={Delete02Icon} size={16} color={theme.accent} />
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            Delete
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.five,
    gap: Spacing.two,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  title: ScreenHeadingTypography,
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: BorderRadius,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
