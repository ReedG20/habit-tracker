import type { StakeKind } from '@/convex/lib/stakeRules';
import type { FocusArea, History, Motivator } from '@/data/onboarding';

import type { CommitmentDraft, CommitmentKind } from '@/components/commitment/draft';

/**
 * Every product event the app sends, with its properties. Names follow
 * PostHog's "object verb" style. Properties stay to enums and numbers: never
 * a commitment title, proof note, friend's name or email.
 */
export type AnalyticsEvents = {
  'onboarding started': undefined;
  'onboarding step completed':
    | { step: 'how' }
    | { step: 'focus'; areas: FocusArea[] }
    | { step: 'history'; history: History }
    | { step: 'motivator'; motivator: Motivator }
    | { step: 'commitment'; kind: CommitmentKind; stake_kind: StakeKind }
    | { step: 'reminders'; notifications_granted: boolean }
    | { step: 'save' };
  'onboarding completed': {
    outcome: 'purchased' | 'restored';
    kind: CommitmentKind | null;
    stake_kind: StakeKind | null;
  };

  'signed up': { method: SignInMethod };
  'signed in': { method: SignInMethod };
  'signed out': undefined;

  'commitment created': {
    kind: CommitmentKind;
    stake_kind: StakeKind;
    /** 0 unless the stake is money. */
    amount_cents: number;
    times_per_week: number | null;
    days_until_due: number | null;
    lockout_days: number | null;
    reused_card: boolean;
    is_redo: boolean;
    source: 'new' | 'onboarding';
  };
  'card saved': { amount_cents: number };
  'commitment restarted': { stake_kind: StakeKind; same_stakes: boolean };
  'commitment deleted': { kind: CommitmentKind };

  /** Sent for review; the verdict comes later from the server. */
  'habit checked in':
    | { method: 'photo'; photo_source: 'camera' | 'library' }
    | { method: 'location' }
    | { method: 'timer'; duration_minutes: number };
  'goal proof submitted': { photo_count: number; has_note: boolean };

  'stake lost viewed': {
    kind: CommitmentKind;
    stake_kind: StakeKind;
    stake_status: string;
    amount_cents: number;
  };
  'stake lost action': {
    action:
      | 'pay'
      | 'redo'
      | 'go_again'
      | 'restart'
      | 'change_stakes'
      | 'text_friend'
      | 'not_now'
      | 'done';
  };
  'stake settled': { result: 'settled' | 'pending' | 'canceled' };

  'paywall viewed': { source: PaywallSource };
  'pro purchased': ProPurchaseProperties;
  'pro purchase cancelled': ProPurchaseProperties;
  'pro restored': { found: boolean };
};

export type SignInMethod = 'apple' | 'google';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `commitment created` properties for a draft about to be saved; `stakeKind` if the save changed it. */
export function commitmentCreatedProperties(
  draft: CommitmentDraft,
  context: { source: 'new' | 'onboarding'; isRedo: boolean; stakeKind?: StakeKind },
): AnalyticsEvents['commitment created'] {
  const stakeKind = context.stakeKind ?? draft.stakeKind;
  return {
    kind: draft.kind,
    stake_kind: stakeKind,
    amount_cents: stakeKind === 'money' ? draft.amountCents : 0,
    times_per_week: draft.kind === 'habit' ? draft.timesPerWeek : null,
    days_until_due: draft.kind === 'goal' ? Math.round((draft.dueAt - Date.now()) / DAY_MS) : null,
    lockout_days: stakeKind === 'lockout' ? draft.lockoutDays : null,
    reused_card: stakeKind === 'money' && draft.reuse?.on === true,
    is_redo: context.isRedo,
    source: context.source,
  };
}

/** Where a Pro paywall was opened from. */
export type PaywallSource = 'onboarding' | 'new' | 'pro_sheet';

type ProPurchaseProperties = {
  plan: 'monthly' | 'annual';
  product_id: string;
  trial_eligible: boolean;
  source: PaywallSource;
};
