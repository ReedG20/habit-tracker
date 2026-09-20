import { useAction, useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { GoalSheetFields, type GoalDraft } from '@/components/goal-sheet-fields';
import { Icon } from '@/components/icon';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { StakePicker } from '@/components/stake-picker';
import { ThemedText } from '@/components/themed-text';
import { ArrowLeft01Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { useStakePayment } from '@/hooks/use-stake-payment';
import { formatCents } from '@/lib/money';

/** The server refuses anything closer than a minute; the form mirrors it. */
const MIN_LEAD_MS = 60 * 1000;

/** Tomorrow evening: far enough to be a real goal, near enough to feel urgent. */
function defaultDueAt(): number {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(21, 0, 0, 0);

  return date.getTime();
}

export default function NewGoalScreen() {
  const createGoal = useMutation(api.goals.create);
  const createStaked = useAction(api.goals.createStaked);
  const stakePayment = useStakePayment();

  // Computed once: the fields are uncontrolled and only read `initial` on mount.
  const [initial] = useState<GoalDraft>(() => ({
    title: '',
    description: '',
    dueAt: defaultDueAt(),
  }));
  const draftRef = useRef<() => GoalDraft>(() => initial);
  const [amountCents, setAmountCents] = useState<number | null>(
    stakePayment.supported ? 1000 : null,
  );
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;

    const draft = draftRef.current();
    const title = draft.title.trim();
    const description = draft.description.trim();
    const { dueAt } = draft;
    if (title.length === 0) {
      Alert.alert('Give the goal a name');
      return;
    }
    if (description.length === 0) {
      Alert.alert('Say what proof you will show', 'That is what the photos get judged against.');
      return;
    }
    if (dueAt < Date.now() + MIN_LEAD_MS) {
      Alert.alert('Pick a deadline in the future');
      return;
    }

    setBusy(true);
    try {
      if (amountCents === null) {
        await createGoal({ title, description, dueAt });
      } else {
        const card = await stakePayment.collectCard(amountCents);
        if (card.kind === 'canceled') {
          setBusy(false);
          return;
        }
        await createStaked({
          title,
          description,
          dueAt,
          amountCents,
          setupIntentId: card.setupIntentId,
        });
      }
      router.back();
    } catch (error: unknown) {
      console.error('Failed to create the goal', error);
      Alert.alert(
        "Couldn't create the goal",
        error instanceof Error ? error.message : 'Check your connection and try again.',
      );
      setBusy(false);
    }
  };

  return (
    <ScreenScrollView>
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
          New goal
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          Decide what done looks like, when it is due, and what it costs to miss it.
        </ThemedText>
      </View>

      <View style={styles.fields}>
        <GoalSheetFields initial={initial} draftRef={draftRef} showDeadline />
        {stakePayment.supported ? (
          <StakePicker amountCents={amountCents} onChange={setAmountCents} disabled={busy} />
        ) : null}
      </View>

      <ActionButton
        label={
          busy
            ? 'Working…'
            : amountCents === null
              ? 'Create goal'
              : `Put ${formatCents(amountCents)} on it`
        }
        variant="primary"
        fill
        disabled={busy}
        onPress={() => void submit()}
      />
    </ScreenScrollView>
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
  fields: {
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
