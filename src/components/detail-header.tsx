import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { ArrowLeft01Icon, Delete02Icon, Edit02Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';

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
        <ActionButton
          label="Edit"

          icon={Edit02Icon}
          size="small"
          onPress={onEdit}
        />
        <ActionButton
          label="Delete"
          accessibilityLabel={deleteLabel}
          icon={Delete02Icon}
          variant="destructive"
          size="small"
          onPress={onDelete}
        />
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
  pressed: {
    opacity: 0.7,
  },
});
