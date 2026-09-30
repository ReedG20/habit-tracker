import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActivityList, type ActivityItem } from '@/components/commitment-detail/activity-list';
import { DetailSection } from '@/components/commitment-detail/detail-section';
import { DevResetProof } from '@/components/commitment-detail/dev-reset-proof';
import { GoalNowPanel } from '@/components/commitment-detail/goal-now-panel';
import { TermsCard } from '@/components/commitment-detail/terms-card';
import { DetailHeader } from '@/components/detail-header';
import { EmptyState } from '@/components/empty-state';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { Camera01Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { SubmissionWithPhotos } from '@/convex/goalSubmissions';
import { isStakeLive } from '@/convex/lib/stakeRules';
import { goalTerms } from '@/data/commitment-terms';
import { isMissed } from '@/data/goals';
import { useNow } from '@/hooks/use-now';
import { track } from '@/lib/analytics';
import { confirmDestructive, notify } from '@/lib/confirm';
import { useForceDelete } from '@/lib/dev-tools';

const STATUS_LABEL: Record<SubmissionWithPhotos['status'], string> = {
  pending: 'Checking your proof…',
  approved: 'Accepted',
  rejected: 'Didn’t count',
  failed: 'Couldn’t check it',
};

function submissionItem(submission: SubmissionWithPhotos): ActivityItem {
  return {
    id: submission._id,
    status: submission.status,
    title: STATUS_LABEL[submission.status],
    at: submission.createdAt,
    lines: [submission.text && `Your note: ${submission.text}`, submission.reason].filter(
      (line): line is string => Boolean(line),
    ),
    photos: submission.photoUrls.flatMap((url, index) =>
      url === null ? [] : [{ key: submission.photoIds[index], url }],
    ),
  };
}

export default function GoalDetailScreen() {
  const { goalId: rawGoalId } = useLocalSearchParams<{ goalId: string }>();
  const goalId = rawGoalId as Id<'goals'>;

  const now = useNow();
  const goal = useQuery(api.goals.get, { goalId });
  const submissions = useQuery(api.goalSubmissions.list, goal ? { goalId } : 'skip');
  const remove = useMutation(api.goals.remove);
  const resetProof = useMutation(api.devProofs.resetGoalProof);
  const forceDelete = useForceDelete();

  if (goal === undefined) {
    return <ScreenScrollView />;
  }

  if (goal === null) {
    return (
      <ScreenScrollView>
        <View style={styles.missing}>
          <ThemedText style={styles.missingTitle} themeColor="text">
            Goal not found
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Go back
            </ThemedText>
          </Pressable>
        </View>
      </ScreenScrollView>
    );
  }

  const done = goal.completedAt !== undefined;
  const missed = isMissed(goal, now);
  const verifying = goal.submission?.status === 'pending';
  const canSubmit = !done && !missed && !verifying;
  const stakeLive = goal.stakeView !== null && isStakeLive(goal.stakeView);

  return (
    <ScreenScrollView>
      <DetailHeader
        title={goal.title}
        deleteLabel="Delete goal"
        onEdit={() => router.push(`/goals/${goalId}/edit`)}
        onDelete={() => {
          if (stakeLive && !forceDelete) {
            notify(
              goal.stakeView?.kind === 'friend'
                ? 'This goal has a friend on it'
                : 'This goal has money on it',
              goal.stakeView?.kind === 'friend'
                ? 'It runs to its deadline. Submit proof before then and nobody hears a thing.'
                : 'It runs to its deadline. Submit proof before then and nothing is charged.',
            );
            return;
          }
          confirmDestructive({
            title: 'Delete goal',
            message: stakeLive
              ? 'Force delete is on: the stake is called off and nothing happens.'
              : 'This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: () => {
              router.back();
              remove({ goalId, force: forceDelete || undefined })
                .then(() => track('commitment deleted', { kind: 'goal' }))
                .catch((error: unknown) => {
                  console.error('Failed to delete the goal', error);
                });
            },
          });
        }}
      />

      <GoalNowPanel goal={goal} now={now} />

      <DevResetProof
        visible={goal.completedAt !== undefined || (submissions?.length ?? 0) > 0}
        label="Reset proof"
        message="Deletes every submission, reopens the goal and re-arms its stake, so you can prove it again."
        onReset={() => resetProof({ goalId })}
      />

      <DetailSection title="the deal">
        <TermsCard terms={goalTerms(goal, now)} />
      </DetailSection>

      <DetailSection title="submissions">
        {submissions === undefined ? null : submissions.length === 0 ? (
          <EmptyState
            icon={Camera01Icon}
            message={
              canSubmit
                ? 'No proof yet. Photos and a note, judged against what you promised.'
                : 'No proof was submitted.'
            }
          />
        ) : (
          <ActivityList items={submissions.map(submissionItem)} />
        )}
      </DetailSection>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  missing: {
    paddingTop: Spacing.five,
    gap: Spacing.two,
  },
  missingTitle: ScreenHeadingTypography,
});
