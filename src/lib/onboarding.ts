import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { CommitmentDraft } from '@/components/commitment/draft';
import { DAILY } from '@/convex/lib/frequency';
import type { OnboardingAnswers, OnboardingStatus } from '@/data/onboarding';

/**
 * Where the first-run flow is up to, on this device. It lives on the device
 * rather than in Convex because most of the flow happens before sign-in: the
 * answers and the first commitment wait here until there is a user to save
 * them to. Same store shape as `theme-preference.ts`.
 */
export type OnboardingState = {
  /** `null` when never written; see `OnboardingStatus`. */
  status: OnboardingStatus | null;
  answers: OnboardingAnswers;
  draft: CommitmentDraft | null;
  /** The draft is in Convex; it stays here only so the paywall can still show it. */
  draftSaved: boolean;
};

const STORAGE_KEY = 'onboarding';

const empty: OnboardingState = {
  status: null,
  answers: { areas: [] },
  draft: null,
  draftSaved: false,
};

const listeners = new Set<() => void>();
let current: OnboardingState = empty;

function read(): OnboardingState {
  try {
    const stored =
      Platform.OS === 'web'
        ? globalThis.localStorage?.getItem(STORAGE_KEY)
        : SecureStore.getItem(STORAGE_KEY);
    if (stored == null) return empty;

    const parsed = JSON.parse(stored) as Partial<OnboardingState>;
    return {
      status:
        parsed.status === 'new' || parsed.status === 'drafted' || parsed.status === 'done'
          ? parsed.status
          : null,
      answers: { areas: [], ...parsed.answers },
      // Drafts saved before habits had a frequency were daily.
      draft:
        parsed.draft == null
          ? null
          : {
              ...parsed.draft,
              timesPerWeek: (parsed.draft as Partial<CommitmentDraft>).timesPerWeek ?? DAILY,
            },
      draftSaved: parsed.draftSaved === true,
    };
  } catch {
    return empty;
  }
}

function write(state: OnboardingState) {
  try {
    const json = JSON.stringify(state);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, json);
    } else {
      SecureStore.setItem(STORAGE_KEY, json);
    }
  } catch (error) {
    console.error('Failed to save onboarding progress', error);
  }
}

function update(patch: Partial<OnboardingState>) {
  current = { ...current, ...patch };
  write(current);
  listeners.forEach((listener) => listener());
}

/** Called at module scope in the root layout, so the first frame picks the right stack. */
export function loadOnboarding() {
  current = read();
}

export function useOnboarding(): OnboardingState {
  return useSyncExternalStore(subscribe, () => current);
}

/** For event handlers that need the latest value without re-rendering on it. */
export function getOnboarding(): OnboardingState {
  return current;
}

export function setAnswers(patch: Partial<OnboardingAnswers>) {
  update({ answers: { ...current.answers, ...patch } });
}

/** Writing the draft is what moves the flow to `drafted`: from here it resumes at sign-in. */
export function setDraft(draft: CommitmentDraft) {
  update({ draft, draftSaved: false, status: 'drafted' });
}

/** Once the draft is saved to Convex, so a relaunch can't create it twice. */
export function markDraftSaved() {
  update({ draftSaved: true });
}

export function completeOnboarding() {
  update({ status: 'done', draft: null, draftSaved: false });
}

/** Start over from the welcome screen: the sign-in screen's "Get started" and the dev replay. */
export function resetOnboarding() {
  update({ status: 'new', answers: { areas: [] }, draft: null, draftSaved: false });
}

/**
 * A signed-in user with no record at all predates onboarding; record them as
 * done so a later sign-out doesn't drop them into the new-user flow.
 */
export function markExistingUserOnboarded() {
  if (current.status === null) update({ status: 'done' });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
