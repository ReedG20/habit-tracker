import type { IconSvgElement } from '@hugeicons/react-native';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Note } from '@/components/commitment/note';
import { Icon } from '@/components/icon';
import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { ThemedText } from '@/components/themed-text';
import { Camera01Icon, CoinsDollarIcon, Target02Icon } from '@/constants/icons';
import { BorderRadius, ControlHeight, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Rule = { icon: IconSvgElement; tint: ThemeColor; title: string; body: string };

const RULES: Rule[] = [
  {
    icon: Target02Icon,
    tint: 'primary',
    title: 'Pick one thing',
    body: 'A habit you repeat, or a goal with a deadline.',
  },
  {
    icon: Camera01Icon,
    tint: 'primary',
    title: 'Prove it with a photo',
    body: 'You say what the photo has to show. AI checks every one. There is no honour system.',
  },
  {
    icon: CoinsDollarIcon,
    tint: 'accent',
    title: 'Miss it, and it costs you',
    body: 'You choose the stakes: money on your card, a friend who hears about it, or a lockout. Money works best, and it’s separate from your subscription.',
  },
];

export default function HowScreen() {
  const theme = useTheme();
  const rules = RULES;

  return (
    <OnboardingScreen
      step="how"
      title="Here’s the deal"
      subtitle="Ante is simple, and it doesn’t let you off easy."
      footer={
        <ActionButton
          label="Sounds fair"
          variant="primary"
          fill
          onPress={() => router.push('/onboarding/focus')}
        />
      }>
      <View style={styles.rules}>
        {rules.map((rule) => (
          <View key={rule.title} style={styles.rule}>
            <View style={[styles.iconTile, { backgroundColor: theme.backgroundElement }]}>
              <Icon icon={rule.icon} size={24} themeColor={rule.tint} />
            </View>
            <View style={styles.text}>
              <ThemedText type="smallBold">{rule.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {rule.body}
              </ThemedText>
            </View>
          </View>
        ))}
      </View>
      <Note>an ante is the chip you put in before the hand. no chip, no game.</Note>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  rules: {
    gap: Spacing.four,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  iconTile: {
    width: ControlHeight,
    height: ControlHeight,
    borderRadius: BorderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
    paddingTop: Spacing.half,
  },
});
