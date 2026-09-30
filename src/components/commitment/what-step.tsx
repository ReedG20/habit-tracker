import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { CommitmentDraft, CommitmentKind } from './draft';
import { NamePage } from './name-page';
import { ProofPage } from './proof-page';
import { useNameCheck, type NameCheckResult } from './use-name-check';
import { useWordingCheck } from './use-wording-check';

/**
 * The step has two pages under its own titles, like the stakes step: the
 * `name` (and how often, or by when), then the `proof`.
 */
export type WhatPhase = 'name' | 'proof';

export function whatTitle(phase: WhatPhase, kind: CommitmentKind): string {
  if (phase === 'name') return 'What are you committing to?';
  return kind === 'habit' ? 'How will you prove it?' : 'What will prove it’s done?';
}

export type WhatStepProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  onNext: () => void;
  /** Held by the screen, so its Back button can go from `proof` to `name`. */
  phase: WhatPhase;
  onPhaseChange: (phase: WhatPhase) => void;
  /** Presets shown as chips under the name, per kind; onboarding fills them from the survey. */
  suggestions?: Record<CommitmentKind, { title: string; proof: string }[]>;
};

/**
 * Step 1: what exactly, how often or by when, and what counts as proof. The
 * name is checked in the background while it's typed, which also writes proof
 * ideas for the second page; the finished wording is checked before moving on,
 * since every proof is judged against it.
 */
export function WhatStep({
  draft,
  onChange,
  onNext,
  phase,
  onPhaseChange,
  suggestions,
}: WhatStepProps) {
  const nameCheck = useNameCheck(draft.kind, draft.timesPerWeek);
  const wording = useWordingCheck();
  // Once the user picks a method, the name check's best fit no longer moves it.
  const methodPicked = useRef(false);

  // A name that's already there (a saved draft, going again, Back from the
  // stakes) gets its check and ideas without waiting for a keystroke.
  const { ensure } = nameCheck;
  const initialTitle = useRef(draft.title);
  useEffect(() => {
    if (initialTitle.current.trim().length > 0) void ensure(initialTitle.current);
  }, [ensure]);

  const nameChecked = (result: NameCheckResult) => {
    // The best fit fills in the method until the user chooses one, as long
    // as no proof has been written for the current one.
    if (
      draft.kind === 'habit' &&
      !methodPicked.current &&
      draft.proof.trim().length === 0 &&
      result.bestMethod !== null
    ) {
      onChange({ proofMethod: result.bestMethod });
    }
    // The icon follows the name until the user picks one themselves.
    if (draft.iconChosen !== true) onChange({ icon: result.icon ?? undefined });
    wording.dismiss();
    onPhaseChange('proof');
  };

  // Keyed per page for the fade, while this component (and what it
  // remembers) stays mounted across both.
  return (
    <Animated.View key={phase} entering={FadeIn.duration(220)} style={styles.page}>
      {phase === 'name' ? (
        <NamePage
          draft={draft}
          onChange={onChange}
          nameCheck={nameCheck}
          onNext={nameChecked}
          suggestions={suggestions}
        />
      ) : (
        <ProofPage
          draft={draft}
          onChange={onChange}
          onNext={onNext}
          onEditName={() => onPhaseChange('name')}
          onMethodPicked={() => {
            methodPicked.current = true;
          }}
          nameCheck={nameCheck}
          wording={wording}
          suggestions={suggestions}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
});
