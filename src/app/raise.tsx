import { useAction, useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import {
  cardForStake,
  friendInput,
  lockoutLabel,
  type CommitmentDraft,
} from '@/components/commitment/draft';
import { LockedIn } from '@/components/commitment/locked-in';
import { SignStep } from '@/components/commitment/sign-step';
import {
  phaseBeforeSigning,
  StakesStep,
  type StakesPhase,
} from '@/components/commitment/stakes-step';
import { Icon } from '@/components/icon';
import { ProPaywallScreen } from '@/components/pro-paywall-screen';
import { StakeLadder } from '@/components/raise/stake-ladder';
import { ThemedText } from '@/components/themed-text';
import { ArrowLeft01Icon, Cancel01Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { heldStake, raiseOptions, type RaiseOptions } from '@/convex/lib/stakeLadder';
import type { StakeView } from '@/convex/lib/stakeRules';
import { missNow, raiseDraft, stakeCents, type RaiseTarget } from '@/data/raise';
import { useNow } from '@/hooks/use-now';
import { useSubscription } from '@/hooks/use-subscription';
import { useTheme } from '@/hooks/use-theme';
import { captureError, track } from '@/lib/analytics';
import { formatCents } from '@/lib/money';
import { userErrorMessage } from '@/lib/user-errors';

type Step = 'stakes' | 'sign' | 'done';

type Target = { habitId: Id<'habits'> } | { goalId: Id<'goals'> };

/** The server refuses a raise closer to a goal's deadline than this. */
const MIN_LEAD_MS = 60 * 1000;

/** What the commitment and its stake were when the flow began; a raise changes both. */
type Snapshot = { found: RaiseTarget; options: RaiseOptions };

/**
 * Upping the ante on a goal or habit that's already running: a higher stake,
 * or more of the same one, never less (`convex/lib/stakeLadder.ts`). Opened
 * from a commitment's detail screen, or from the Today card that offers money
 * on the onboarding commitment (`?source=nudge`, which starts at the amount).
 */
export default function RaiseScreen() {
  const params = useLocalSearchParams<{ habitId?: string; goalId?: string; source?: string }>();
  const target: Target | null =
    params.habitId !== undefined
      ? { habitId: params.habitId as Id<'habits'> }
      : params.goalId !== undefined
        ? { goalId: params.goalId as Id<'goals'> }
        : null;
  const found = useQuery(api.raises.target, target === null ? 'skip' : { target });
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const subscription = useSubscription();
  const now = useNow();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const options = found == null ? null : raiseOptions(found.stake, found.commitment);
  const unavailable =
    found == null || options === null
      ? null
      : (found.blocked ??
        (found.dueAt !== undefined && found.dueAt < now + MIN_LEAD_MS
          ? 'It’s too close to the deadline to change the stakes.'
          : null) ??
        (options.canRaise
          ? null
          : 'It’s already as high as it goes: $50 is the most one stake can be.'));

  // Freeze it once the flow starts: the raise itself changes what the query returns.
  if (snapshot === null && found != null && options !== null && unavailable === null) {
    setSnapshot({ found, options });
  }

  // The server refuses a raise without Pro; ask first rather than fail at the signature.
  if (!subscription.isPro && !subscription.isLoading) {
    return <ProPaywallScreen source="raise" onClose={() => router.back()} onFinished={() => {}} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {snapshot !== null && target !== null ? (
        <RaiseFlow
          target={target}
          snapshot={snapshot}
          source={params.source === 'nudge' ? 'nudge' : 'detail'}
        />
      ) : found === undefined && target !== null ? null : (
        <Unavailable
          reason={
            found == null ? 'This one is gone.' : (unavailable ?? 'This one can’t be raised.')
          }
        />
      )}
    </View>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <View style={[styles.header, styles.unavailable]}>
      <ThemedText style={styles.title} themeColor="text">
        Up the ante.
      </ThemedText>
      <ThemedText themeColor="textSecondary">{reason}</ThemedText>
      <ActionButton label="Close" variant="neutral" onPress={() => router.back()} />
    </View>
  );
}

/** A stake's size in a word or two, for the ladder. */
function sizeLabel(stake: StakeView | null): string | undefined {
  const held = heldStake(stake);
  switch (held?.kind) {
    case 'money':
      return formatCents(held.amountCents);
    case 'lockout':
      return held.days === 7 ? '1 week' : lockoutLabel(held.days);
    default:
      return undefined;
  }
}

function pickedLabel(draft: CommitmentDraft): string | undefined {
  switch (draft.stakeKind) {
    case 'money':
      return formatCents(draft.amountCents);
    case 'lockout':
      return draft.lockoutDays === 7 ? '1 week' : lockoutLabel(draft.lockoutDays);
    case 'friend': {
      const name = draft.friend.name.trim().split(/\s+/)[0];
      return name === undefined || name.length === 0 ? undefined : name;
    }
    case 'none':
      return undefined;
  }
}

function RaiseFlow({
  target,
  snapshot,
  source,
}: {
  target: Target;
  snapshot: Snapshot;
  source: 'nudge' | 'detail';
}) {
  const { found, options } = snapshot;
  const raise = useMutation(api.raises.raise);
  const raiseWithCard = useAction(api.raises.raiseWithCard);
  const [draft, setDraft] = useState<CommitmentDraft>(() => raiseDraft(found, options));
  const [step, setStep] = useState<Step>('stakes');
  // Only one way up, or the Today card already asked about money: straight to the amount.
  const straightToTune =
    options.kinds.length === 1 || (source === 'nudge' && draft.stakeKind === 'money');
  const [stakesPhase, setStakesPhase] = useState<StakesPhase>(straightToTune ? 'tune' : 'pick');
  const [busy, setBusy] = useState(false);
  const update = useCallback(
    (patch: Partial<CommitmentDraft>) => setDraft((current) => ({ ...current, ...patch })),
    [],
  );
  const current = heldStake(found.stake);
  const stakesRaise = { options, current: found.stake };

  const lockIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      switch (draft.stakeKind) {
        case 'money': {
          if (current?.kind === 'money') {
            await raise({ target, stake: { kind: 'money', amountCents: draft.amountCents } });
            break;
          }
          const card = cardForStake(draft);
          if (card === null) {
            setStakesPhase('tune');
            setStep('stakes');
            return;
          }
          await raiseWithCard({
            target,
            amountCents: draft.amountCents,
            setupIntentId: card.setupIntentId,
          });
          break;
        }
        case 'lockout':
          await raise({ target, stake: { kind: 'lockout', days: draft.lockoutDays } });
          break;
        case 'friend':
          await raise({ target, stake: { kind: 'friend', friend: friendInput(draft.friend) } });
          break;
        case 'none':
          return;
      }
      track('stakes raised', {
        kind: found.commitment,
        from_kind: options.currentKind,
        to_kind: draft.stakeKind,
        from_cents: current?.kind === 'money' ? current.amountCents : 0,
        to_cents: stakeCents(draft.stakeKind, draft.amountCents),
        source,
      });
      setStep('done');
    } catch (error: unknown) {
      console.error('Failed to raise the stakes', error);
      captureError(error, 'raise stakes');
      Alert.alert(
        'Couldn’t raise the stakes',
        userErrorMessage(error, 'Check your connection and try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step === 'sign') {
      setStakesPhase(phaseBeforeSigning(draft));
      setStep('stakes');
    } else if (stakesPhase === 'tune' && !straightToTune) {
      setStakesPhase('pick');
    } else {
      router.back();
    }
  };
  const closing = step === 'stakes' && (stakesPhase === 'pick' || straightToTune);

  return (
    <>
      {step === 'done' ? (
        <View style={styles.header} />
      ) : (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closing ? 'Close' : 'Back'}
            onPress={back}
            disabled={busy}
            hitSlop={Spacing.three}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Icon
              icon={closing ? Cancel01Icon : ArrowLeft01Icon}
              size={18}
              themeColor="textSecondary"
            />
            <ThemedText type="small" themeColor="textSecondary">
              {closing ? 'Close' : step === 'sign' ? 'Change the stakes' : 'Back'}
            </ThemedText>
          </Pressable>
          <ThemedText style={styles.title} themeColor="text">
            {step === 'stakes' ? 'Up the ante.' : 'Sign the new terms.'}
          </ThemedText>
          {step === 'stakes' && stakesPhase === 'pick' ? (
            <ThemedText themeColor="textSecondary">
              Right now, missing “{found.title}” {missNow(found.stake)}. What’s it worth to you?
            </ThemedText>
          ) : null}
          {step === 'stakes' ? (
            <StakeLadder
              commitment={found.commitment}
              current={{ kind: options.currentKind, label: sizeLabel(found.stake) }}
              picked={{ kind: draft.stakeKind, label: pickedLabel(draft) }}
            />
          ) : null}
        </View>
      )}

      <Animated.View key={step} entering={FadeIn.duration(220)} style={styles.step}>
        {step === 'stakes' ? (
          <StakesStep
            draft={draft}
            onChange={update}
            onNext={() => setStep('sign')}
            phase={stakesPhase}
            onPhaseChange={setStakesPhase}
            raise={stakesRaise}
          />
        ) : null}
        {step === 'sign' ? (
          <SignStep draft={draft} busy={busy} onConfirm={() => void lockIn()} />
        ) : null}
        {step === 'done' ? (
          <LockedIn
            draft={draft}
            title="Raised."
            note="no climbing back down."
            onDone={() => router.back()}
          />
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  unavailable: {
    alignItems: 'flex-start',
  },
  step: {
    flex: 1,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  title: ScreenHeadingTypography,
  pressed: {
    opacity: 0.7,
  },
});
