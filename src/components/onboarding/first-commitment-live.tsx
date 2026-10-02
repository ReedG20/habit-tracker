import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TellFriendCard } from './tell-friend-card';

import type { CommitmentDraft } from '@/components/commitment/draft';
import { LockedIn } from '@/components/commitment/locked-in';
import { openShare, type ShareTarget } from '@/components/share/open-share';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FirstCommitmentLiveProps = {
  draft: CommitmentDraft;
  target: ShareTarget;
  /** When it stops being undoable, which is also when a friend hears. */
  callOffUntil: number;
  onDone: () => void;
};

/**
 * The end of onboarding: the first commitment, live. The same "It's on." as
 * any new commitment, at the moment it means the most, so it's where sharing
 * it is offered (saying it out loud makes it more likely to stick). With a
 * friend on the hook, it also offers to text them first.
 */
export function FirstCommitmentLive({
  draft,
  target,
  callOffUntil,
  onDone,
}: FirstCommitmentLiveProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.background, paddingTop: insets.top + Spacing.three },
      ]}>
      <Animated.View entering={FadeInDown.duration(420)} style={styles.column}>
        <LockedIn
          draft={draft}
          callOffUntil={callOffUntil}
          // The friend card is one more section than "It's on." usually has.
          gap={draft.stakeKind === 'friend' ? Spacing.three : undefined}
          doneLabel="Let’s go"
          note="the hard part was deciding. that’s done."
          onShare={() => openShare(target, 'onboarding', 'stake')}
          onDone={onDone}>
          {draft.stakeKind === 'friend' ? <TellFriendCard draft={draft} /> : null}
        </LockedIn>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  column: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
});
