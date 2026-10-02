import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { accomplishmentValidator } from './lib/accomplishmentSchema';
import { chargeReviewValidator, moneyBlockValidator } from './lib/chargeReviewSchema';
import { comebackValidator } from './lib/comebackSchema';
import { contractValidator } from './lib/contractSchema';
import { endedHabitValidator } from './lib/endedHabitSchema';
import { graceMarkValidator, graceValidator } from './lib/graceSchema';
import { photoOriginValidator } from './lib/photoOrigin';
import { proofMethodValidator } from './lib/proofMethods';
import { lockoutDaysValidator, moneyStatusValidator, stakeDocValidator } from './lib/stakeSchema';

/** The money stake's lifecycle; see `lib/stakeSchema.ts`. */
export const stakeStatusValidator = moneyStatusValidator;

/** Mirrors the options in `src/data/onboarding.ts`. */
export const onboardingValidator = v.object({
  areas: v.array(
    v.union(
      v.literal('fitness'),
      v.literal('health'),
      v.literal('focus'),
      v.literal('learning'),
      v.literal('money'),
      v.literal('mind'),
      v.literal('home'),
      v.literal('other'),
    ),
  ),
  history: v.optional(
    v.union(
      v.literal('fades'),
      v.literal('never_start'),
      v.literal('consistent'),
      v.literal('first_try'),
    ),
  ),
  motivator: v.optional(
    v.union(v.literal('money'), v.literal('proof'), v.literal('streak'), v.literal('unsure')),
  ),
  completedAt: v.number(),
});

/** Deprecated: the money stake as it was embedded on goals, before the `stakes` table. */
export const stakeValidator = v.object({
  amountCents: v.number(),
  stripeCustomerId: v.string(),
  stripePaymentMethodId: v.string(),
  stripeSetupIntentId: v.string(),
  status: stakeStatusValidator,
  /** The scheduled `stripe.settle` run, so completion can cancel it. */
  settleJobId: v.optional(v.id('_scheduled_functions')),
  stripePaymentIntentId: v.optional(v.string()),
  chargedAt: v.optional(v.number()),
  failureReason: v.optional(v.string()),
  /** Set by the `charge.refunded` webhook. A partial refund keeps `charged`. */
  refundedCents: v.optional(v.number()),
  refundedAt: v.optional(v.number()),
  /** Set by the `charge.dispute.created` webhook. */
  stripeDisputeId: v.optional(v.string()),
  disputedAt: v.optional(v.number()),
});

/**
 * What the settings row displays, not what grants access: a `cancelled`
 * subscription keeps Pro until `expiresAt`, and a `billing_issue` keeps it
 * through Apple's grace period (RevenueCat extends `expiresAt` for that).
 * Access is always "`expiresAt` is in the future" (`lib/entitlements.ts`).
 */
export const subscriptionStatusValidator = v.union(
  v.literal('trial'),
  v.literal('active'),
  v.literal('cancelled'),
  v.literal('billing_issue'),
  /** Play Store only. */
  v.literal('paused'),
  v.literal('expired'),
);

export const submissionStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('failed'),
);

/**
 * Days are stored as `YYYY-MM-DD` rather than timestamps. The client computes
 * the key from the device clock, so "did I do this today" follows the user's
 * local day (which ends at 3 AM, `DAY_ENDS_AT_HOUR`) instead of UTC, and it
 * stays a plain index lookup.
 */
export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    pictureUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    /** Created lazily the first time the user puts money on a goal. */
    stripeCustomerId: v.optional(v.string()),
    /** The first-run survey, saved once the new user signs in. */
    onboarding: v.optional(onboardingValidator),
    /**
     * The device's IANA zone (`America/Chicago`), reported on every launch. The
     * lockout check needs it to know when the user's day has ended; nobody is
     * checked until it is known.
     */
    timeZone: v.optional(v.string()),
    /**
     * The first day a miss can count (`lib/lockout.ts`). Set to tomorrow when the
     * zone is first reported and again on re-entry, so today is always free.
     */
    accountableFrom: v.optional(v.string()),
    /** Every day up to and including this one has been checked for misses. */
    lastCheckedDay: v.optional(v.string()),
    /** Set on a chargeback or fraud warning; no new money stakes until it's cleared. */
    moneyBlocked: v.optional(moneyBlockValidator),
    /** When their one-time reprieve on a first miss was used (`lib/grace.ts`). */
    graceUsedAt: v.optional(v.number()),
  })
    .index('by_token', ['tokenIdentifier'])
    .index('by_email', ['email']),

  habits: defineTable({
    userId: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    /**
     * Days a week it is due, on any days, 1 to 7; 7 is every day. Absent on
     * habits made before frequency existed, which are daily (`targetPerWeek`).
     */
    timesPerWeek: v.optional(v.number()),
    order: v.number(),
    /** The user's local day it was made; that day is never checked. Absent on older habits. */
    startDay: v.optional(v.string()),
    /**
     * Set when it is deleted while still owed: the last day (daily) or the
     * last day of one of its weeks (weekly) that still counts. The lockout check removes it after that.
     */
    endsAfter: v.optional(v.string()),
    /**
     * The end date chosen when it was made: the last day (daily) or the last
     * day of one of its weeks (weekly) that counts. It finishes on its own
     * after that. Absent means it runs until ended (`lib/endDate.ts`).
     */
    endsOn: v.optional(v.string()),
    /** The stake it runs on now; none means just the user's word. */
    stakeId: v.optional(v.id('stakes')),
    /**
     * Set when its stake came due: the streak broke, so it is no longer judged
     * until the user restarts it with new stakes.
     */
    brokenAt: v.optional(v.number()),
    /** How it is proved; absent means photo (`lib/proofMethods.ts`). */
    proofMethod: v.optional(proofMethodValidator),
    /** A timer habit's length in minutes. */
    timerMinutes: v.optional(v.number()),
    /** Until when it can still be called off or swapped for new terms (`lib/callOff.ts`). */
    callOffUntil: v.optional(v.number()),
    /** A key from `lib/commitmentIcons.ts`; absent on ones made before icons. */
    icon: v.optional(v.string()),
    /** Set once the user picks the icon themselves, so a rename leaves it alone. */
    iconChosen: v.optional(v.boolean()),
  }).index('by_user', ['userId']),

  habitCompletions: defineTable({
    userId: v.id('users'),
    habitId: v.id('habits'),
    day: v.string(),
    completedAt: v.number(),
  })
    .index('by_habit_and_day', ['habitId', 'day'])
    .index('by_user_and_day', ['userId', 'day']),

  /**
   * One row per proof attempt: a photo, a location check-in, or a finished or
   * abandoned timer. `pending` rows drive the card's "verifying" state; a
   * resolved row is kept as the audit trail for the day. `failed` means we
   * never got a verdict (API error, timeout), as opposed to `rejected`, where
   * the check said no.
   */
  habitVerifications: defineTable({
    userId: v.id('users'),
    habitId: v.id('habits'),
    day: v.string(),
    /** Absent means photo, for rows from before other methods. */
    method: v.optional(proofMethodValidator),
    /** Photo proof only. */
    photoId: v.optional(v.id('_storage')),
    /** Photo proof only: in-app camera or library, as the app reported it. */
    photoOrigin: v.optional(photoOriginValidator),
    /** Location proof only: where the phone said it was. */
    coords: v.optional(
      v.object({ latitude: v.number(), longitude: v.number(), accuracy: v.number() }),
    ),
    /**
     * Location proof only: the Google place it matched. Google's terms allow
     * keeping place IDs, not names.
     */
    placeId: v.optional(v.string()),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('failed'),
    ),
    reason: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_habit_and_day', ['habitId', 'day'])
    .index('by_user_and_day', ['userId', 'day']),

  /**
   * One row per timer started for a timer habit (`timerProofs.ts`). A run is
   * not a pending check: it only counts once it ends, when it writes an
   * approved or rejected verification.
   */
  habitTimerRuns: defineTable({
    userId: v.id('users'),
    habitId: v.id('habits'),
    day: v.string(),
    startedAt: v.number(),
    durationMs: v.number(),
    status: v.union(v.literal('running'), v.literal('completed'), v.literal('abandoned')),
    endedAt: v.optional(v.number()),
  }).index('by_habit_and_day', ['habitId', 'day']),

  /**
   * A goal is a one-off commitment with a hard deadline. It can only be
   * completed through an approved submission; `stake` is present when the user
   * put money on it, in which case missing `dueAt` charges the saved card.
   */
  goals: defineTable({
    userId: v.id('users'),
    title: v.string(),
    /** What proof the user promised to show. The model judges photos against it. */
    description: v.optional(v.string()),
    /** Deadline as a timestamp: goals are due at a specific time, not just a day. */
    dueAt: v.number(),
    /** Set when the one-time reprieve moved `dueAt` (`lib/grace.ts`): the deadline as signed. */
    originalDueAt: v.optional(v.number()),
    /** Until when it can still be called off or swapped for new terms (`lib/callOff.ts`). */
    callOffUntil: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    order: v.number(),
    /** Deprecated: goal money moved to the `stakes` table (`lib/stakes.ts` migrates it). */
    stake: v.optional(stakeValidator),
    stakeId: v.optional(v.id('stakes')),
    /** A key from `lib/commitmentIcons.ts`; absent on ones made before icons. */
    icon: v.optional(v.string()),
    /** Set once the user picks the icon themselves, so a rename leaves it alone. */
    iconChosen: v.optional(v.boolean()),
  })
    .index('by_user', ['userId'])
    // Replay protection: a SetupIntent may back at most one goal.
    .index('by_setup_intent', ['stake.stripeSetupIntentId'])
    // Webhook lookup for events that carry no metadata (disputes).
    .index('by_payment_intent', ['stake.stripePaymentIntentId']),

  /**
   * One row per proof attempt. Same lifecycle as `habitVerifications`, but a
   * submission carries several photos and an optional note. `photoIds` is
   * bounded (see `MAX_SUBMISSION_PHOTOS`), so it lives on the row.
   */
  goalSubmissions: defineTable({
    userId: v.id('users'),
    goalId: v.id('goals'),
    photoIds: v.array(v.id('_storage')),
    /** Where each photo came from, in `photoIds` order; absent from older builds. */
    photoOrigins: v.optional(v.array(photoOriginValidator)),
    text: v.optional(v.string()),
    status: submissionStatusValidator,
    reason: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_goal', ['goalId'])
    // Proof kept after its goal was deleted (`evidence.ts`) is found by user.
    .index('by_user', ['userId']),

  /**
   * Every Stripe webhook event we have acted on, by Stripe's event id. Stripe
   * retries until it sees a 2xx and may deliver twice, so the handler records
   * the id in the same transaction as the state change it causes.
   */
  stripeEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
  }).index('by_event_id', ['eventId']),

  /**
   * Mirror of the user's RevenueCat subscription, one row per user, written
   * only by the `/revenuecat/webhook` handler (`revenuecat.ts`). The client
   * also reads the SDK's CustomerInfo, so this row is for server-side checks
   * and lags a purchase by however long the webhook takes.
   */
  subscriptions: defineTable({
    userId: v.id('users'),
    status: subscriptionStatusValidator,
    /** `ante_pro_monthly` | `ante_pro_annual`; what the user last bought or changed to. */
    productId: v.string(),
    /** RevenueCat's `store` (APP_STORE, PLAY_STORE, ...); a string so a new value cannot break the webhook. */
    store: v.string(),
    /** RevenueCat's `period_type`: TRIAL, INTRO, NORMAL, PROMOTIONAL, PREPAID. */
    periodType: v.string(),
    environment: v.union(v.literal('SANDBOX'), v.literal('PRODUCTION')),
    purchasedAt: v.number(),
    /** Absent only for grants that never expire. */
    expiresAt: v.optional(v.number()),
    willRenew: v.boolean(),
    /** Set by PRODUCT_CHANGE; the switch itself lands as a later RENEWAL. */
    pendingProductId: v.optional(v.string()),
    cancelReason: v.optional(v.string()),
    expirationReason: v.optional(v.string()),
    /** The `app_user_id` on the last event, for tracing aliases and transfers. */
    rcAppUserId: v.string(),
    /** `event_timestamp_ms` of the newest event applied; older deliveries are dropped. */
    lastEventAt: v.number(),
    lastEventType: v.string(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

  /**
   * Deprecated with the re-entry fee; lockout stakes use `freezes`.
   * A missed habit locks the whole app until the re-entry fee is paid. One row
   * per lock; every miss found by the same check shares it, and so one fee.
   * `misses` is bounded: at most one entry per habit.
   */
  lockouts: defineTable({
    userId: v.id('users'),
    status: v.union(v.literal('active'), v.literal('paid')),
    lockedAt: v.number(),
    misses: v.array(
      v.object({
        habitId: v.id('habits'),
        title: v.string(),
        kind: v.union(v.literal('day'), v.literal('week')),
        /** The missed day, or the first day of the week that ended short. */
        period: v.string(),
      }),
    ),
    paidAt: v.optional(v.number()),
    /** Set when a developer lifted it with `devUnlock` rather than a purchase. */
    waived: v.optional(v.boolean()),
  }).index('by_user_and_status', ['userId', 'status']),

  /**
   * Deprecated with the re-entry fee; kept for the purchases already made.
   * Every re-entry fee purchase, by its store transaction id, so the webhook
   * and `lockouts.confirmReentry` can both report one without applying it
   * twice. `lockoutId` is the lock it paid for; absent means no lock was
   * waiting for it (a duplicate report), and it is never applied later.
   */
  reentryPayments: defineTable({
    userId: v.id('users'),
    transactionId: v.string(),
    productId: v.string(),
    environment: v.union(v.literal('SANDBOX'), v.literal('PRODUCTION')),
    receivedAt: v.number(),
    lockoutId: v.optional(v.id('lockouts')),
  })
    .index('by_transaction_id', ['transactionId'])
    .index('by_user', ['userId']),

  /** Same role as `stripeEvents`: RevenueCat retries until 2xx and may deliver twice. */
  revenuecatEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
  }).index('by_event_id', ['eventId']),

  /**
   * What each commitment has on the line (`lib/stakeSchema.ts`). One row per
   * stake, kept after it resolves: it is the receipt, and what the loss screen
   * and Stripe webhooks look up.
   */
  stakes: defineTable(stakeDocValidator)
    .index('by_user_and_status', ['userId', 'status'])
    .index('by_goal', ['goalId'])
    .index('by_habit', ['habitId'])
    // Unseen losses: `seenAt` absent, `lostAt` set.
    .index('by_user_and_seen_and_lost', ['userId', 'seenAt', 'lostAt'])
    // Replay protection: a SetupIntent may back at most one stake.
    .index('by_setup_intent', ['stripeSetupIntentId'])
    // Webhook lookup for events that carry no metadata (disputes).
    .index('by_payment_intent', ['stripePaymentIntentId']),

  /**
   * People a user has named to hear about a miss, reused across commitments.
   * `optOutToken` is the secret in their opt-out link.
   */
  friends: defineTable({
    userId: v.id('users'),
    name: v.string(),
    /** Trimmed and lowercased. */
    email: v.string(),
    status: v.union(v.literal('active'), v.literal('opted_out'), v.literal('bounced')),
    optOutToken: v.string(),
    createdAt: v.number(),
  })
    .index('by_user_and_email', ['userId', 'email'])
    .index('by_email', ['email'])
    .index('by_opt_out_token', ['optOutToken']),

  /** Addresses Ante never emails again: opted out of everything, bounced, or complained. */
  emailSuppressions: defineTable({
    email: v.string(),
    reason: v.union(v.literal('opt_out'), v.literal('bounce'), v.literal('complaint')),
    createdAt: v.number(),
  }).index('by_email', ['email']),

  /**
   * A lockout stake came due: every habit is frozen (not logged, not judged)
   * from `startDay` through `endDay`, local days. Goals keep running.
   */
  freezes: defineTable({
    userId: v.id('users'),
    startDay: v.string(),
    endDay: v.string(),
    /** When `endDay` ends locally (`DAY_ENDS_AT_HOUR` the next morning), and `freezes.lift` runs. */
    endsAt: v.number(),
    days: lockoutDaysValidator,
    status: v.union(v.literal('active'), v.literal('lifted')),
    liftJobId: v.optional(v.id('_scheduled_functions')),
    createdAt: v.number(),
  })
    .index('by_user_and_status', ['userId', 'status'])
    .index('by_user_and_endDay', ['userId', 'endDay']),

  /**
   * How hard deadline reminders push (`lib/reminderPresets.ts`). At most one
   * row per user; none means the defaults.
   */
  notificationSettings: defineTable({
    userId: v.id('users'),
    preset: v.union(v.literal('gentle'), v.literal('firm'), v.literal('relentless')),
    morningLineup: v.boolean(),
    breakThroughFocus: v.boolean(),
    approvals: v.boolean(),
    /** Nudges once nothing is running (`comebacks.ts`); absent means on. */
    comebacks: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

  /**
   * One Expo push token per device, owned by whoever signed in on it last.
   * `permission` is what iOS last told the app; only granted or provisional
   * devices are sent to.
   */
  pushTokens: defineTable({
    userId: v.id('users'),
    token: v.string(),
    permission: v.union(
      v.literal('granted'),
      v.literal('provisional'),
      v.literal('denied'),
      v.literal('undetermined'),
    ),
    updatedAt: v.number(),
  })
    .index('by_token', ['token'])
    .index('by_user', ['userId']),

  /**
   * Where each user's reminder schedule is up to (`reminders.runUser`). Kept
   * off `users` because it is written on every run.
   */
  reminderState: defineTable({
    userId: v.id('users'),
    /** Bumped by every re-plan; a run carrying an older one stops. */
    generation: v.number(),
    /** The next scheduled run, so a re-plan can cancel it. */
    jobId: v.optional(v.id('_scheduled_functions')),
    /** Every planned slot at or before this has been sent or passed over. */
    sentThrough: v.number(),
    lastPushAt: v.optional(v.number()),
    /** The local day `sentToday` counts, for the daily cap. */
    day: v.optional(v.string()),
    sentToday: v.number(),
  }).index('by_user', ['userId']),

  /** Commitments seen through (`lib/accomplishmentSchema.ts`), for the Kept screen. */
  accomplishments: defineTable(accomplishmentValidator).index('by_user_and_seen_and_achieved', [
    'userId',
    'seenAt',
    'achievedAt',
  ]),

  /** Deleted habits (`lib/endedHabitSchema.ts`), for the Past list on Commitments. */
  endedHabits: defineTable(endedHabitValidator).index('by_user', ['userId']),

  /** Signed contracts (`lib/contractSchema.ts`), held back up on the Kept and loss screens. */
  contracts: defineTable(contractValidator)
    .index('by_habit', ['habitId'])
    .index('by_goal', ['goalId'])
    .index('by_user', ['userId']),

  /** Charges contested in the app (`lib/chargeReviewSchema.ts`). */
  chargeReviews: defineTable(chargeReviewValidator)
    .index('by_stake', ['stakeId'])
    .index('by_user_and_status', ['userId', 'status']),

  /** The one-time reprieve on a first miss (`lib/graceSchema.ts`). */
  graces: defineTable(graceValidator)
    .index('by_user_and_seen', ['userId', 'seenAt'])
    .index('by_stake', ['stakeId']),

  /** Who already had theirs, by hash; outlives account deletion on purpose. */
  graceMarks: defineTable(graceMarkValidator).index('by_hash', ['hash']),

  /** Nudges once nothing is running (`lib/comebackSchema.ts`). */
  comebacks: defineTable(comebackValidator).index('by_user', ['userId']),
});
