import type { ContestReason } from '@/convex/lib/chargeReviewSchema';
import type { ProofMethod } from '@/convex/lib/proofMethods';
import type { StakeKind } from '@/convex/lib/stakeRules';
import type { FocusArea, History, Motivator } from '@/data/onboarding';
import type { ShareCardKind, ShareSource } from '@/data/share-copy';

import {
  draftEndDay,
  type CommitmentDraft,
  type CommitmentKind,
} from '@/components/commitment/draft';
import { daysBetween } from '@/convex/lib/days';
import { todayKey } from '@/lib/dates';

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
  'account deleted': undefined;

  'commitment created': {
    kind: CommitmentKind;
    stake_kind: StakeKind;
    /** 0 unless the stake is money. */
    amount_cents: number;
    times_per_week: number | null;
    /** Habits only: days from today through its end date; `null` when it runs until ended. */
    days_until_end: number | null;
    days_until_due: number | null;
    lockout_days: number | null;
    reused_card: boolean;
    is_redo: boolean;
    /** `go_again` is the Kept screen's "Go again", or a comeback push that opened it. */
    source: 'new' | 'onboarding' | 'go_again';
  };
  'card saved': { amount_cents: number };
  /** One of the name check's proof ideas put in the proof field. */
  'proof idea picked': { kind: CommitmentKind; method: ProofMethod };
  'commitment restarted': { stake_kind: StakeKind; same_stakes: boolean };
  /** Upped the ante on a running commitment (`raises.ts`). Cents are 0 for anything but money. */
  'stakes raised': {
    kind: CommitmentKind;
    from_kind: StakeKind;
    to_kind: StakeKind;
    from_cents: number;
    to_cents: number;
    source: 'nudge' | 'detail';
  };
  /** The one-time Today card offering money on the onboarding commitment. */
  'raise nudge shown': { kind: CommitmentKind; stake_kind: StakeKind };
  'raise nudge dismissed': { kind: CommitmentKind; stake_kind: StakeKind };
  'commitment deleted': { kind: CommitmentKind };
  /** Taken back in its first moments (`convex/lib/callOff.ts`), instead of `commitment deleted`. */
  'commitment called off': { kind: CommitmentKind; stake_kind: StakeKind; minutes_left: number };
  /** Its terms changed in those moments, instead of `commitment created`. */
  'commitment terms changed': {
    kind: CommitmentKind;
    stake_kind: StakeKind;
    from_stake_kind: StakeKind;
    /** 0 unless the stake is money. */
    amount_cents: number;
    days_until_due: number | null;
  };
  /** A staked habit given its notice (`habits.remove` scheduled it), or that notice taken back. */
  'habit ending started': { notice_days: number; stake_kind: StakeKind };
  'habit ending cancelled': { days_left: number };
  /** The Kept screen for a commitment seen through, and how it was left. */
  'kept viewed': { kind: CommitmentKind; stake_kind: StakeKind; has_contract: boolean };
  'kept action': {
    action: 'done' | 'start_another' | 'share' | 'go_again' | 'go_again_higher';
  };
  /**
   * The share sheet, and what came of it. `activity` is the iOS activity the
   * user picked (`com.burbn.instagram.shareextension`), or `dismissed`.
   */
  'share opened': { card: ShareCardKind; source: ShareSource };
  'share completed': {
    card: ShareCardKind;
    source: ShareSource;
    shown_amount: boolean;
    theme: 'light' | 'dark';
    activity: string;
  };

  /** Sent for review; the verdict comes later from the server. */
  'habit checked in':
    | { method: 'photo'; photo_source: 'camera' | 'library'; has_camera_metadata: boolean }
    | { method: 'location' }
    | { method: 'timer'; duration_minutes: number };
  'goal proof submitted': {
    photo_count: number;
    has_note: boolean;
    library_count: number;
    no_metadata_count: number;
  };

  'stake lost viewed': {
    kind: CommitmentKind;
    stake_kind: StakeKind;
    stake_status: string;
    amount_cents: number;
    /** The signed contract was there to show. */
    has_contract: boolean;
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
      | 'done'
      | 'start_another'
      | 'contest';
  };
  /** The one-time reprieve on a first miss (`convex/lib/grace.ts`), and what came of it. */
  'grace viewed': {
    grace_kind: 'waived' | 'extended';
    stake_kind: StakeKind;
    /** How many commitments it covered. */
    covered: number;
    has_contract: boolean;
  };
  'grace reason': { reason: 'forgot' | 'proof' | 'busy' | 'too_much' };
  'grace action': {
    action: 'done' | 'send_proof' | 'later' | 'reminders' | 'support' | 'open_habit';
  };
  'stake settled': { result: 'settled' | 'pending' | 'canceled' };
  'charge contested': { reason: ContestReason; has_note: boolean };

  'paywall viewed': { source: PaywallSource };
  'pro purchased': ProPurchaseProperties;
  'pro purchase cancelled': ProPurchaseProperties;
  'pro restored': { found: boolean };

  /** This build is below `MIN_IOS_BUILD`, so the app is replaced by "Time to update". */
  'update required shown': { build: number; minimum: number };
  'update required tapped': { build: number; minimum: number };
};

export type SignInMethod = 'apple' | 'google';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `commitment created` properties for a draft about to be saved; `stakeKind` if the save changed it. */
export function commitmentCreatedProperties(
  draft: CommitmentDraft,
  context: {
    source: AnalyticsEvents['commitment created']['source'];
    isRedo: boolean;
    stakeKind?: StakeKind;
  },
): AnalyticsEvents['commitment created'] {
  const stakeKind = context.stakeKind ?? draft.stakeKind;
  const endDay = draftEndDay(draft);
  return {
    kind: draft.kind,
    stake_kind: stakeKind,
    amount_cents: stakeKind === 'money' ? draft.amountCents : 0,
    times_per_week: draft.kind === 'habit' ? draft.timesPerWeek : null,
    days_until_end: endDay === undefined ? null : daysBetween(todayKey(), endDay).length - 1,
    days_until_due: draft.kind === 'goal' ? Math.round((draft.dueAt - Date.now()) / DAY_MS) : null,
    lockout_days: stakeKind === 'lockout' ? draft.lockoutDays : null,
    reused_card: stakeKind === 'money' && draft.reuse?.on === true,
    is_redo: context.isRedo,
    source: context.source,
  };
}

/** Where a Pro paywall was opened from. */
export type PaywallSource =
  | 'onboarding'
  | 'new'
  | 'restart'
  | 'raise'
  | 'daily'
  | 'today_card'
  | 'habit_card'
  | 'habit_detail'
  | 'commitments'
  | 'me';

export const PAYWALL_SOURCES: readonly PaywallSource[] = [
  'onboarding',
  'new',
  'restart',
  'raise',
  'daily',
  'today_card',
  'habit_card',
  'habit_detail',
  'commitments',
  'me',
];

type ProPurchaseProperties = {
  plan: 'monthly' | 'annual';
  product_id: string;
  trial_eligible: boolean;
  source: PaywallSource;
};
