import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import {
  bestFitPatch,
  type CommitmentDraft,
  type CommitmentKind,
  type CommitmentSuggestion,
} from './draft';
import { NamePage } from './name-page';
import { ProofPage } from './proof-page';
import { useNameCheck, type NameCheckResult } from './use-name-check';
import { useWordingCheck } from './use-wording-check';

import { ensureAiConsent } from '@/lib/ai-consent';

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
  suggestions?: Record<CommitmentKind, CommitmentSuggestion[]>;
  /** Why no more of the chosen kind can be made right now, or null. */
  full?: string | null;
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
  full,
}: WhatStepProps) {
  const nameCheck = useNameCheck(draft.kind, draft.timesPerWeek);
  const wording = useWordingCheck();
  // Once the user picks a method, the name check's best fit no longer moves it.
  const methodPicked = useRef(false);

  // A name that's already there (a saved draft, going again, Back from the
  // stakes) gets its check and ideas without waiting for a keystroke.
  // First, once, whether AI may help at all: the name check and ideas send the name to it.
  const { ensure } = nameCheck;
  const initialTitle = useRef(draft.title);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void ensureAiConsent('ideas').then((allowed) => {
      if (allowed && initialTitle.current.trim().length > 0) void ensure(initialTitle.current);
    });
  }, [ensure]);

  const nameChecked = (result: NameCheckResult) => {
    const bestFit = bestFitPatch(draft, result, suggestions?.[draft.kind], methodPicked.current);
    if (bestFit !== null) onChange(bestFit);
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
          full={full}
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
