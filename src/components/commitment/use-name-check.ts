import { useAction } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CommitmentKind } from './draft';

import { api } from '@/convex/_generated/api';
import type { NameCheckResult } from '@/convex/commitmentIdeas';

export type { NameCheckResult };

/** How long typing has to pause before the name is sent. */
const DEBOUNCE_MS = 800;

/** Remembered names, so going back and forth never asks twice. */
const CACHE_LIMIT = 30;

/** What a failed call resolves to: through, with nothing to offer. */
const OPEN: NameCheckResult = {
  ok: true,
  feedback: null,
  suggestedTitle: null,
  bestMethod: null,
  ideas: { photo: [], location: [], timer: [] },
};

// Module-level, so they outlive the step: Back from the stakes remounts it.
const results = new Map<string, NameCheckResult>();
const inFlight = new Map<string, Promise<NameCheckResult>>();

function cacheKey(kind: CommitmentKind, title: string): string {
  return `${kind}\n${title.trim().toLowerCase()}`;
}

function remember(key: string, result: NameCheckResult) {
  results.delete(key);
  results.set(key, result);
  if (results.size > CACHE_LIMIT) {
    const oldest = results.keys().next().value;
    if (oldest !== undefined) results.delete(oldest);
  }
}

/**
 * A guess that the user has finished typing the name: long enough to be a
 * word, with one real word in it. Anything shorter waits for Next.
 */
export function looksFinished(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length >= 4 && /\p{L}{3,}/u.test(trimmed);
}

/**
 * The background check on a commitment's name (`commitmentIdeas.checkName`):
 * whether it's something provable, and proof ideas for the next page. It runs
 * after a pause in typing so Next rarely waits, and results are kept per kind
 * and name. Errors let the name through with no ideas, like the server does.
 */
export function useNameCheck(kind: CommitmentKind, timesPerWeek: number) {
  const checkName = useAction(api.commitmentIdeas.checkName);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped whenever a result lands, so `lookup` readers re-render.
  const [, setVersion] = useState(0);
  const [pending, setPending] = useState(0);

  // The latest settings, for calls fired from a timer.
  const settings = useRef({ kind, timesPerWeek });
  useEffect(() => {
    settings.current = { kind, timesPerWeek };
  }, [kind, timesPerWeek]);

  const ensure = useCallback(
    (title: string): Promise<NameCheckResult> => {
      const { kind: currentKind, timesPerWeek: times } = settings.current;
      const key = cacheKey(currentKind, title);
      const cached = results.get(key);
      if (cached !== undefined) return Promise.resolve(cached);
      const running = inFlight.get(key);
      if (running !== undefined) return running;

      setPending((count) => count + 1);
      const args = {
        kind: currentKind,
        title: title.trim(),
        timesPerWeek: currentKind === 'habit' ? times : undefined,
      };
      const call = checkName(args)
        // One more try: a dropped connection mid-call is the usual failure.
        .catch(() => checkName(args))
        .then((result) => {
          remember(key, result);
          return result;
        })
        .catch((error: unknown) => {
          // Not cached: a later try may get through.
          console.warn('Name check failed; letting it through', error);
          return OPEN;
        })
        .finally(() => {
          inFlight.delete(key);
          setPending((count) => count - 1);
          setVersion((version) => version + 1);
        });
      inFlight.set(key, call);
      return call;
    },
    [checkName],
  );

  /** Call on every keystroke: checks the name once typing pauses, if it looks done. */
  const schedule = useCallback(
    (title: string) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      if (!looksFinished(title)) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        void ensure(title);
      }, DEBOUNCE_MS);
    },
    [ensure],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  /** The result for this name, if it's back. */
  const lookup = (title: string): NameCheckResult | undefined => results.get(cacheKey(kind, title));

  /** Whether this name is still out being checked. */
  const isChecking = (title: string): boolean => inFlight.has(cacheKey(kind, title));

  /**
   * Takes the model's rewrite of the name as passed, carrying the ideas it
   * wrote for it, so moving on doesn't ask again.
   */
  const adopt = (title: string, from: NameCheckResult) => {
    remember(cacheKey(kind, title), { ...from, ok: true, feedback: null, suggestedTitle: null });
    setVersion((version) => version + 1);
  };

  return { schedule, ensure, lookup, isChecking, adopt, busy: pending > 0 };
}
