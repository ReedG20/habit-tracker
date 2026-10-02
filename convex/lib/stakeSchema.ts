import { v } from 'convex/values';

/**
 * The shape of a stake: what a commitment puts on the line, one row per stake
 * in the `stakes` table. Kept out of `schema.ts` so that file only grows by the
 * table registration.
 *
 * No row means no stakes ("just my word"). A habit's stake is spent once, the
 * first time its streak breaks; restarting the habit arms a new row, so the
 * old one stays as the receipt.
 */

/**
 * Money: `armed` → `charging` → `charged` | `charge_failed` when the goal's
 * deadline passes or the habit's streak breaks; `armed` → `released` when a
 * goal is proven or a habit is ended first. `charging` is the loss's claim, so
 * a re-run cannot double charge. After the money moved, Stripe webhooks can
 * take it further: `charged` → `refunded` on a full refund, `charged` |
 * `refunded` → `disputed`. A declined card can still settle up later, which
 * moves `charge_failed` → `charged`.
 */
export const moneyStatusValidator = v.union(
  v.literal('armed'),
  v.literal('charging'),
  v.literal('charged'),
  v.literal('charge_failed'),
  v.literal('released'),
  v.literal('refunded'),
  v.literal('disputed'),
);

/** Friend: `armed` → `told` on a miss, `released` when it ends well, `void` when the friend opts out. */
export const friendStatusValidator = v.union(
  v.literal('armed'),
  v.literal('told'),
  v.literal('released'),
  v.literal('void'),
);

/** Lockout (habits only): `armed` → `triggered` on a miss, `released` when the habit ends first. */
export const lockoutStatusValidator = v.union(
  v.literal('armed'),
  v.literal('triggered'),
  v.literal('released'),
);

export const lockoutDaysValidator = v.union(v.literal(1), v.literal(3), v.literal(7));

/** How the stake ended, captured when a habit breaks, so the loss screen can tell the story. */
export const runValidator = v.object({
  /** Days for a daily habit, weeks for the rest. */
  streak: v.number(),
  unit: v.union(v.literal('day'), v.literal('week')),
  /** Photos logged while this stake was armed. */
  completions: v.number(),
  /** The first day this stake could count. */
  sinceDay: v.string(),
  /** The day missed, or the first day of the week that came up short. */
  missedPeriod: v.string(),
});

const common = {
  userId: v.id('users'),
  /** Exactly one of `goalId` and `habitId`. */
  goalId: v.optional(v.id('goals')),
  habitId: v.optional(v.id('habits')),
  /** The commitment's title when it was staked: the habit may be gone by the time it's lost. */
  title: v.string(),
  createdAt: v.number(),
  /** When the commitment was missed and the stake came due. */
  lostAt: v.optional(v.number()),
  /** When the user saw the loss screen for it. */
  seenAt: v.optional(v.number()),
  releasedAt: v.optional(v.number()),
  /**
   * When the user last upped the ante on it (`raises.ts`): set on a stake that
   * took an old one's place, and on one raised in place (more money, a longer lock).
   */
  raisedAt: v.optional(v.number()),
  /** Goals only: the job that resolves the stake at the deadline, so proof can cancel it. */
  resolveJobId: v.optional(v.id('_scheduled_functions')),
  run: v.optional(runValidator),
};

export const moneyFields = {
  amountCents: v.number(),
  stripeCustomerId: v.string(),
  stripePaymentMethodId: v.string(),
  /** Absent when the card was reused from an earlier stake rather than saved again. */
  stripeSetupIntentId: v.optional(v.string()),
  cardBrand: v.optional(v.string()),
  cardLast4: v.optional(v.string()),
  /** Stripe's fingerprint for the card number, so one card earns one reprieve (`lib/grace.ts`). */
  cardFingerprint: v.optional(v.string()),
  stripePaymentIntentId: v.optional(v.string()),
  chargedAt: v.optional(v.number()),
  failureReason: v.optional(v.string()),
  /** `declined` is the card's answer, which the user has to settle; `error` was ours. */
  failureKind: v.optional(v.union(v.literal('declined'), v.literal('error'))),
  /** The on-session PaymentIntent a declined stake is being settled up with. */
  settleUpPaymentIntentId: v.optional(v.string()),
  /** Set by the `charge.refunded` webhook. A partial refund keeps `charged`. */
  refundedCents: v.optional(v.number()),
  refundedAt: v.optional(v.number()),
  /** Set by the `charge.dispute.created` webhook. */
  stripeDisputeId: v.optional(v.string()),
  disputedAt: v.optional(v.number()),
};

export const moneyStakeValidator = v.object({
  kind: v.literal('money'),
  ...common,
  status: moneyStatusValidator,
  ...moneyFields,
});

export const friendStakeValidator = v.object({
  kind: v.literal('friend'),
  ...common,
  status: friendStatusValidator,
  friendId: v.id('friends'),
  /** Snapshots, so the loss screen reads right even if the friend row changes. */
  friendName: v.string(),
  friendEmail: v.string(),
  toldAt: v.optional(v.number()),
});

export const lockoutStakeValidator = v.object({
  kind: v.literal('lockout'),
  ...common,
  status: lockoutStatusValidator,
  days: lockoutDaysValidator,
  freezeId: v.optional(v.id('freezes')),
});

export const stakeDocValidator = v.union(
  moneyStakeValidator,
  friendStakeValidator,
  lockoutStakeValidator,
);
