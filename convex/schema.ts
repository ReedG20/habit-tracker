import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * `armed` → `charging` → `charged` | `charge_failed` when the deadline passes
 * uncompleted; `armed` → `released` when a submission is approved first.
 * `charging` is the settlement action's claim, so a re-run cannot double charge.
 * After the money moved, Stripe webhooks (`http.ts`) can take it further:
 * `charged` → `refunded` on a full refund, `charged` | `refunded` → `disputed`.
 */
export const stakeStatusValidator = v.union(
  v.literal('armed'),
  v.literal('charging'),
  v.literal('charged'),
  v.literal('charge_failed'),
  v.literal('released'),
  v.literal('refunded'),
  v.literal('disputed'),
);

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
 * local midnight instead of UTC, and it stays a plain index lookup.
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
  })
    .index('by_token', ['tokenIdentifier'])
    .index('by_email', ['email']),

  /** Every habit is once per day for now; frequency is implicit. */
  habits: defineTable({
    userId: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
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
   * One row per photo submitted as proof. `pending` rows drive the card's
   * "verifying" state; a resolved row is kept as the audit trail for the day.
   * `failed` means we never got a verdict (API error, timeout), as opposed to
   * `rejected`, where the model said no.
   */
  habitVerifications: defineTable({
    userId: v.id('users'),
    habitId: v.id('habits'),
    day: v.string(),
    photoId: v.id('_storage'),
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
    completedAt: v.optional(v.number()),
    order: v.number(),
    stake: v.optional(stakeValidator),
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
    text: v.optional(v.string()),
    status: submissionStatusValidator,
    reason: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index('by_goal', ['goalId']),

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

  /** Same role as `stripeEvents`: RevenueCat retries until 2xx and may deliver twice. */
  revenuecatEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
  }).index('by_event_id', ['eventId']),
});
