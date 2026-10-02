import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import type { CommitmentDraft } from './draft';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Message01Icon, Tick02Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import { inviteCode, inviteUrl } from '@/convex/lib/invite';
import { friendTextBody, friendTextCadence } from '@/data/invite-copy';
import { useSessionUserId } from '@/hooks/use-signed-in-session';
import { useTheme } from '@/hooks/use-theme';
import { captureError, track } from '@/lib/analytics';
import { successHaptic } from '@/lib/haptics';

/**
 * On "It's on.", when a friend is on the hook: a nudge to text them first.
 * Ante's heads-up email lands better when they're expecting it, and a text
 * from a friend is the one invite people open.
 */
export function TellFriendCard({
  draft,
  source,
}: {
  draft: CommitmentDraft;
  /** Where "It's on." was reached: the first commitment, or one made in the app. */
  source: 'onboarding' | 'new';
}) {
  const theme = useTheme();
  const userId = useSessionUserId();
  const [sent, setSent] = useState(false);
  const name = draft.friend.name.trim() || 'them';

  const text = async () => {
    const message = friendTextBody({
      friendName: draft.friend.name.trim(),
      title: draft.title,
      kind: draft.kind,
      cadence: friendTextCadence(
        draft.kind === 'habit'
          ? { kind: 'habit', timesPerWeek: draft.timesPerWeek }
          : { kind: 'goal', dueAt: draft.dueAt },
      ),
      url: inviteUrl('friend_text', userId === null ? undefined : inviteCode(userId)),
    });
    try {
      const result = await Share.share({ message });
      const activity =
        result.action === Share.sharedAction ? (result.activityType ?? 'shared') : 'dismissed';
      track('friend texted', { source, activity });
      if (activity !== 'dismissed') {
        successHaptic();
        setSent(true);
      }
    } catch (error) {
      captureError(error, 'text friend');
    }
  };

  // One row, so it adds a line to "It's on." rather than a screenful.
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Icon
        icon={sent ? Tick02Icon : Message01Icon}
        size={24}
        strokeWidth={2}
        themeColor="primary"
      />
      <View style={styles.text}>
        <ThemedText type="smallBold">
          {sent ? `${name} knows it’s coming` : `Tell ${name} yourself`}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sent ? 'Now someone will ask.' : 'Before our email does.'}
        </ThemedText>
      </View>
      {sent ? null : (
        <ActionButton label={`Text ${name}`} size="small" onPress={() => void text()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: CardRadius,
    padding: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
