import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { PreviewPush } from '@/data/reminder-preview';
import { useTheme } from '@/hooks/use-theme';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

export type NotificationPreviewProps = {
  pushes: PreviewPush[];
  /** Label each push with its weekday too, for goals that span days. */
  showDay?: boolean;
};

/**
 * Pushes drawn the way iOS shows them on the lock screen, so the Reminders
 * screen can show exactly what's coming instead of describing it.
 */
export function NotificationPreview({ pushes, showDay = false }: NotificationPreviewProps) {
  return (
    <View style={styles.stack}>
      {pushes.map((push) => (
        <Animated.View
          key={`${push.at}:${push.title}`}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(120)}
          layout={LinearTransition.duration(220)}>
          <PushCard push={push} showDay={showDay} />
        </Animated.View>
      ))}
    </View>
  );
}

function PushCard({ push, showDay }: { push: PreviewPush; showDay: boolean }) {
  const theme = useTheme();
  const at = new Date(push.at);
  const time = showDay ? `${dayFormat.format(at)} ${timeFormat.format(at)}` : timeFormat.format(at);

  return (
    <View
      accessible
      accessibilityLabel={`At ${time}: ${push.title}. ${push.body}`}
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Image source={require('@/assets/images/icon.png')} style={styles.appIcon} />
      <View style={styles.text}>
        {push.timeSensitive ? (
          <ThemedText type="smallSemibold" style={styles.timeSensitive} themeColor="accent">
            TIME SENSITIVE
          </ThemedText>
        ) : null}
        <View style={styles.titleRow}>
          <ThemedText type="smallSemibold" themeColor="text" style={styles.title} numberOfLines={1}>
            {push.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {time}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="text" numberOfLines={3}>
          {push.body}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.two,
  },
  // iOS notification proportions: a rounded slab, icon on the left.
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + Spacing.half,
    borderRadius: 22,
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
  },
  appIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    marginTop: 2,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  timeSensitive: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
  },
});
