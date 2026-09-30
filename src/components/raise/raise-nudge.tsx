import { useQuery } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import {
  ArrowRight01Icon,
  ArrowUpDoubleIcon,
  Cancel01Icon,
  CoinsDollarIcon,
  LockIcon,
  Mail01Icon,
  Money03Icon,
  Tick02Icon,
} from '@/constants/icons';
import { CardRadius, PillRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { heldStake } from '@/convex/lib/stakeLadder';
import { raiseNudgeCopy, shouldShowRaiseNudge, type RaiseNudgeCandidate } from '@/data/raise-nudge';
import { useSubscription } from '@/hooks/use-subscription';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';

const DISMISSED_KEY = 'raiseNudgeDismissed';

let dismissed = readDismissed();
const listeners = new Set<() => void>();
/** Commitments already counted as shown this session, so a re-render isn't another view. */
const shown = new Set<string>();

function readDismissed(): boolean {
  try {
    return SecureStore.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  dismissed = true;
  try {
    SecureStore.setItem(DISMISSED_KEY, '1');
  } catch {
    // Only lasts this session then; it's still gone for now.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The onboarding commitment, while the Today card should offer money on it:
 * the first week after onboarding, with Pro, until it's dismissed for good or
 * the commitment has money on it. Null otherwise, and while loading.
 */
export function useRaiseNudge(now: number): RaiseNudgeCandidate | null {
  const candidate = useQuery(api.raises.firstCommitment);
  const subscription = useSubscription();
  const isDismissed = useSyncExternalStore(subscribe, () => dismissed);
  const show = shouldShowRaiseNudge({
    candidate,
    isPro: subscription.isPro,
    dismissed: isDismissed,
    now,
  });
  return show && candidate != null ? candidate : null;
}

function analyticsOf(candidate: RaiseNudgeCandidate) {
  const held = heldStake(candidate.stake);
  return {
    kind: 'habitId' in candidate.target ? ('habit' as const) : ('goal' as const),
    stake_kind: held === null ? ('none' as const) : held.kind,
  };
}

/** Where the stake sits now, as the left side of "now → money". */
function fromChip(candidate: RaiseNudgeCandidate): { label: string; icon: typeof Money03Icon } {
  const held = heldStake(candidate.stake);
  switch (held?.kind) {
    case 'friend':
      return { label: `${held.friendName} hears`, icon: Mail01Icon };
    case 'lockout':
      return { label: 'Lockout', icon: LockIcon };
    default:
      return { label: 'Your word', icon: Tick02Icon };
  }
}

export type RaiseNudgeProps = { candidate: RaiseNudgeCandidate };

/**
 * Onboarding can't take a card, so the first commitment starts on a friend
 * or someone's word. Once the account is set up, this card closes that loop:
 * one tap to put money on it. "×" puts it away for good.
 */
export function RaiseNudge({ candidate }: RaiseNudgeProps) {
  const theme = useTheme();
  const copy = raiseNudgeCopy(candidate);
  const from = fromChip(candidate);
  const target = candidate.target;
  const targetKey = 'habitId' in target ? target.habitId : target.goalId;

  useEffect(() => {
    if (shown.has(targetKey)) return;
    shown.add(targetKey);
    track('raise nudge shown', analyticsOf(candidate));
  }, [targetKey, candidate]);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.heading}>
        <Icon icon={CoinsDollarIcon} size={22} strokeWidth={2} themeColor="primary" />
        <ThemedText type="smallSemibold" themeColor="text" style={styles.headingText}>
          {copy.title}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss for good"
          hitSlop={Spacing.three}
          onPress={() => {
            track('raise nudge dismissed', analyticsOf(candidate));
            dismiss();
          }}
          style={({ pressed }) => pressed && styles.pressed}>
          <Icon icon={Cancel01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
        </Pressable>
      </View>

      <ThemedText type="small" themeColor="text">
        {copy.body}
      </ThemedText>

      {/* The raise in one glance: where it is, and where it'd go. */}
      <View style={styles.climb} accessible accessibilityLabel={`From ${from.label} to money`}>
        <View style={[styles.chip, { backgroundColor: theme.background }]}>
          <Icon icon={from.icon} size={16} strokeWidth={2} themeColor="textSecondary" />
          <ThemedText type="small" themeColor="textSecondary">
            {from.label}
          </ThemedText>
        </View>
        <Icon icon={ArrowRight01Icon} size={18} strokeWidth={2} themeColor="textSecondary" />
        <View style={[styles.chip, { backgroundColor: theme.primary }]}>
          <Icon icon={Money03Icon} size={16} strokeWidth={2} color={theme.onPrimary} />
          <ThemedText type="smallSemibold" style={{ color: theme.onPrimary }}>
            Money
          </ThemedText>
        </View>
      </View>

      <ActionButton
        label={copy.action}
        icon={ArrowUpDoubleIcon}
        variant="primary"
        size="small"
        onPress={() => router.push({ pathname: '/raise', params: { ...target, source: 'nudge' } })}
        style={styles.button}
      />
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
  climb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: PillRadius,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
