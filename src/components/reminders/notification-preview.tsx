import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { PreviewPush } from '@/data/reminder-preview';
import { useTheme } from '@/hooks/use-theme';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

const CARD_RADIUS = 22;

// Glass draws nothing under a parent whose opacity animates, so the cards
// scale in and out rather than fade.
function scaleIn() {
  'worklet';
  return {
    initialValues: { transform: [{ scale: 0.94 }] },
    animations: { transform: [{ scale: withTiming(1, { duration: 220 }) }] },
  };
}

function scaleOut() {
  'worklet';
  return {
    initialValues: { transform: [{ scale: 1 }] },
    animations: { transform: [{ scale: withTiming(0.94, { duration: 120 }) }] },
  };
}

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
          entering={scaleIn}
          exiting={scaleOut}
          layout={LinearTransition.duration(220)}>
          <PushCard push={push} showDay={showDay} />
        </Animated.View>
      ))}
    </View>
  );
}

function PushCard({ push, showDay }: { push: PreviewPush; showDay: boolean }) {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const at = new Date(push.at);
  const time = showDay ? `${dayFormat.format(at)} ${timeFormat.format(at)}` : timeFormat.format(at);

  return (
    <View
      accessible
      accessibilityLabel={`At ${time}: ${push.title}. ${push.body}`}
      style={[styles.card, glass ? null : { backgroundColor: theme.backgroundElement }]}>
      {glass ? (
        <GlassView
          pointerEvents="none"
          // UIKit takes the radius literally, so it's repeated on the glass itself.
          style={[StyleSheet.absoluteFill, styles.glass]}
          glassEffectStyle="regular"
        />
      ) : null}
      <Image source={require('@/assets/images/icon.png')} style={styles.appIcon} />
      <View style={styles.text}>
        {/* The time sits on the first line, as on the lock screen: beside the label when there is one. */}
        <View style={styles.firstRow}>
          {push.timeSensitive ? (
            <ThemedText
              type="smallSemibold"
              style={[styles.flex, styles.timeSensitive]}
              themeColor="textSecondary">
              TIME SENSITIVE
            </ThemedText>
          ) : (
            <Title text={push.title} />
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {time}
          </ThemedText>
        </View>
        {push.timeSensitive ? <Title text={push.title} /> : null}
        <ThemedText type="small" themeColor="text" numberOfLines={3}>
          {push.body}
        </ThemedText>
      </View>
    </View>
  );
}

function Title({ text }: { text: string }) {
  return (
    <ThemedText type="smallSemibold" themeColor="text" style={styles.flex} numberOfLines={1}>
      {text}
    </ThemedText>
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
    borderRadius: CARD_RADIUS,
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
  },
  glass: {
    borderRadius: CARD_RADIUS,
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
  firstRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});
