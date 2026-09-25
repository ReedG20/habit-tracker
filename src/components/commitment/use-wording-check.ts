import { useAction } from 'convex/react';
import { useState } from 'react';
import { Alert } from 'react-native';

import type { CommitmentKind } from './draft';

import { api } from '@/convex/_generated/api';
import type { WordingCheckResult } from '@/convex/commitmentChecks';

export type WordingCheckInput = {
  kind: CommitmentKind;
  title: string;
  proof: string;
  timesPerWeek?: number;
};

/** A check that came back asking for another pass: what to say, and a rewrite if the model had one. */
export type WordingRevision = {
  feedback: string;
  suggestion: { title: string; proof: string } | null;
};

/**
 * Runs `commitmentChecks.check` and holds its verdict for the feedback card.
 * `run` resolves `null` when the wording can go ahead, or the revision it
 * needs (also kept as `revision` until dismissed). A network error lets it
 * through, like the server does on a model error: the check is a helper, and
 * saving will surface a real connection problem anyway.
 */
export function useWordingCheck() {
  const check = useAction(api.commitmentChecks.check);
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState<WordingRevision | null>(null);

  const run = async (input: WordingCheckInput): Promise<WordingRevision | null> => {
    setChecking(true);
    setRevision(null);
    try {
      const result: WordingCheckResult = await check(input);
      if (result.ok) return null;

      const next = { feedback: result.feedback ?? '', suggestion: result.suggestion };
      setRevision(next);
      return next;
    } catch (error: unknown) {
      console.error('Wording check failed; letting it through', error);
      return null;
    } finally {
      setChecking(false);
    }
  };

  return { run, checking, revision, dismiss: () => setRevision(null) };
}

/**
 * The revision as a system alert, for the fixed-height edit sheets where an
 * inline card has no room. Offers the rewrite when the model had one.
 */
export function alertRevision(
  revision: WordingRevision,
  onUseSuggestion: (suggestion: { title: string; proof: string }) => void,
) {
  const { suggestion } = revision;
  const feedback =
    revision.feedback || 'Make it specific enough that one photo could clearly show you did it.';

  Alert.alert(
    'Make it provable',
    suggestion === null
      ? feedback
      : `${feedback}\n\nSuggestion: ${suggestion.title}. Proof: ${suggestion.proof}`,
    suggestion === null
      ? [{ text: 'OK' }]
      : [
          { text: 'Edit it myself', style: 'cancel' },
          { text: 'Use suggestion', onPress: () => onUseSuggestion(suggestion) },
        ],
  );
}
