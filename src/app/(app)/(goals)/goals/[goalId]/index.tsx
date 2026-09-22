import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { DetailHeader } from '@/components/detail-header';
import { EmptyState } from '@/components/empty-state';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Camera01Icon } from '@/constants/icons';
import {
  BorderRadius,
  CardRadius,
  Fonts,
  ScreenHeadingTypography,
  Spacing,
} from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { SubmissionWithPhotos } from '@/convex/goalSubmissions';
import { isMissed, type GoalWithStatus } from '@/data/goals';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { formatCompletedAt, formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

function describeStake(goal: GoalWithStatus): string {
  const { stake } = goal;
  if (stake === undefined) return 'Nothing on it';

  const amount = formatCents(stake.amountCents);
  switch (stake.status) {
    case 'armed':
      return `${amount} · charged if missed`;
    case 'charging':
      return `${amount} · charging`;
    case 'charged':
      return `${amount} · charged`;
    case 'charge_failed':
      return `${amount} · charge failed${stake.failureReason ? ` (${stake.failureReason})` : ''}`;
    case 'released':
      return `${amount} · safe`;
    case 'refunded':
      return `${amount} · refunded`;
    case 'disputed':
      return `${amount} · disputed`;
  }
}

const STATUS_LABEL: Record<SubmissionWithPhotos['status'], string> = {
  pending: 'Verifying…',
  approved: 'Accepted',
  rejected: 'Not accepted',
  failed: 'Check failed',
};

export default function GoalDetailScreen() {
  const { goalId: rawGoalId } = useLocalSearchParams<{ goalId: string }>();
  const goalId = rawGoalId as Id<'goals'>;

  const theme = useTheme();
  const now = useNow();
  const goal = useQuery(api.goals.get, { goalId });
  const submissions = useQuery(api.goalSubmissions.list, goal ? { goalId } : 'skip');
  const remove = useMutation(api.goals.remove);

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
  const armed = goal.stake?.status === 'armed';

  return (
    <ScreenScrollView>
      <DetailHeader
        title={goal.title}
        description={goal.description}
        deleteLabel="Delete goal"
        onEdit={() => router.push(`/goals/${goalId}/edit`)}
        onDelete={() =>
          confirmDestructive({
            title: 'Delete goal',
            message: armed
              ? 'The stake is called off and nothing is charged. This cannot be undone.'
              : 'This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: () => {
              router.back();
              void remove({ goalId }).catch((error: unknown) => {
                console.error('Failed to delete the goal', error);
              });
            },
          })
        }
      />

      <ThemedView type="backgroundElement" style={styles.meta}>
        <View style={styles.metaRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Status
          </ThemedText>
          <ThemedText type="smallBold" themeColor={missed ? 'accent' : 'text'}>
            {done ? 'Done' : missed ? 'Missed' : verifying ? 'Verifying' : 'In progress'}
          </ThemedText>
        </View>
        <View style={[styles.metaRow, { borderTopWidth: 1, borderTopColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Deadline
          </ThemedText>
          <ThemedText type="smallBold">{formatDueAt(goal.dueAt)}</ThemedText>
        </View>
        <View style={[styles.metaRow, { borderTopWidth: 1, borderTopColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Stake
          </ThemedText>
          <ThemedText
            type="smallBold"
            themeColor={goal.stake?.status === 'charged' ? 'accent' : 'text'}
            style={styles.metaValue}
            numberOfLines={2}>
            {describeStake(goal)}
          </ThemedText>
        </View>
        {goal.completedAt !== undefined ? (
          <View style={[styles.metaRow, { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary">
              Completed
            </ThemedText>
            <ThemedText type="smallBold">{formatCompletedAt(goal.completedAt).date}</ThemedText>
          </View>
        ) : null}
      </ThemedView>

      {canSubmit ? (
        <ActionButton
          label="Submit proof"
          icon={Camera01Icon}
          variant="primary"
          fill
          onPress={() => router.navigate(`/goals/${goalId}/submit`)}
        />
      ) : null}

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle} themeColor="text">
          submissions
        </ThemedText>

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
          <ThemedView type="backgroundElement" style={styles.group}>
            {submissions.map((submission, index) => (
              <View
                key={submission._id}
                style={[
                  styles.submission,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}>
                <View style={styles.submissionHeader}>
                  <ThemedText
                    type="smallBold"
                    themeColor={
                      submission.status === 'approved'
                        ? 'text'
                        : submission.status === 'pending'
                          ? 'textSecondary'
                          : 'accent'
                    }>
                    {STATUS_LABEL[submission.status]}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatCompletedAt(submission.createdAt).time}
                    {' · '}
                    {formatCompletedAt(submission.createdAt).date}
                  </ThemedText>
                </View>

                <View style={styles.thumbnails}>
                  {submission.photoUrls.map((url, photoIndex) =>
                    url === null ? null : (
                      <Image
                        key={submission.photoIds[photoIndex]}
                        source={{ uri: url }}
                        style={[styles.thumbnail, { backgroundColor: theme.background }]}
                        contentFit="cover"
                        accessibilityLabel={`Photo ${photoIndex + 1} of ${submission.photoUrls.length}`}
                      />
                    ),
                  )}
                </View>

                {submission.text ? (
                  <ThemedText type="small" themeColor="text">
                    {submission.text}
                  </ThemedText>
                ) : null}
                {submission.reason ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {submission.reason}
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </ThemedView>
        )}
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  missing: {
    paddingTop: Spacing.five,
    gap: Spacing.two,
  },
  missingTitle: ScreenHeadingTypography,
  meta: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  metaValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
    paddingHorizontal: Spacing.one,
  },
  group: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  submission: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  submissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  thumbnails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius,
  },
});
