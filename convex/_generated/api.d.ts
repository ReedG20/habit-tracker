/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accomplishments from "../accomplishments.js";
import type * as accountDeletion from "../accountDeletion.js";
import type * as accountNotices from "../accountNotices.js";
import type * as appVersion from "../appVersion.js";
import type * as calendar from "../calendar.js";
import type * as callOff from "../callOff.js";
import type * as chargeReviews from "../chargeReviews.js";
import type * as comebacks from "../comebacks.js";
import type * as commitmentChecks from "../commitmentChecks.js";
import type * as commitmentIcons from "../commitmentIcons.js";
import type * as commitmentIdeas from "../commitmentIdeas.js";
import type * as contracts from "../contracts.js";
import type * as crons from "../crons.js";
import type * as devProofs from "../devProofs.js";
import type * as devSeed from "../devSeed.js";
import type * as emails from "../emails.js";
import type * as endedHabits from "../endedHabits.js";
import type * as evidence from "../evidence.js";
import type * as freezes from "../freezes.js";
import type * as friends from "../friends.js";
import type * as goalSubmissions from "../goalSubmissions.js";
import type * as goals from "../goals.js";
import type * as graces from "../graces.js";
import type * as habitChecks from "../habitChecks.js";
import type * as habitHistory from "../habitHistory.js";
import type * as habitStreaks from "../habitStreaks.js";
import type * as habits from "../habits.js";
import type * as http from "../http.js";
import type * as lib_accomplishmentSchema from "../lib/accomplishmentSchema.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_callOff from "../lib/callOff.js";
import type * as lib_chargeReviewSchema from "../lib/chargeReviewSchema.js";
import type * as lib_comebackSchema from "../lib/comebackSchema.js";
import type * as lib_comebacks from "../lib/comebacks.js";
import type * as lib_commitmentIcons from "../lib/commitmentIcons.js";
import type * as lib_commitmentLimits from "../lib/commitmentLimits.js";
import type * as lib_commitmentText from "../lib/commitmentText.js";
import type * as lib_contractSchema from "../lib/contractSchema.js";
import type * as lib_customFunctions from "../lib/customFunctions.js";
import type * as lib_days from "../lib/days.js";
import type * as lib_emailCopy from "../lib/emailCopy.js";
import type * as lib_endDate from "../lib/endDate.js";
import type * as lib_endedHabitSchema from "../lib/endedHabitSchema.js";
import type * as lib_ending from "../lib/ending.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_frequency from "../lib/frequency.js";
import type * as lib_grace from "../lib/grace.js";
import type * as lib_graceCopy from "../lib/graceCopy.js";
import type * as lib_graceSchema from "../lib/graceSchema.js";
import type * as lib_habitHistory from "../lib/habitHistory.js";
import type * as lib_habitWeek from "../lib/habitWeek.js";
import type * as lib_invite from "../lib/invite.js";
import type * as lib_lockout from "../lib/lockout.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_openrouter from "../lib/openrouter.js";
import type * as lib_photoOrigin from "../lib/photoOrigin.js";
import type * as lib_places from "../lib/places.js";
import type * as lib_proof from "../lib/proof.js";
import type * as lib_proofMethods from "../lib/proofMethods.js";
import type * as lib_reminderCopy from "../lib/reminderCopy.js";
import type * as lib_reminderPlan from "../lib/reminderPlan.js";
import type * as lib_reminderPresets from "../lib/reminderPresets.js";
import type * as lib_reminderTimes from "../lib/reminderTimes.js";
import type * as lib_stakeLadder from "../lib/stakeLadder.js";
import type * as lib_stakeRules from "../lib/stakeRules.js";
import type * as lib_stakeSchema from "../lib/stakeSchema.js";
import type * as lib_stakes from "../lib/stakes.js";
import type * as lib_streaks from "../lib/streaks.js";
import type * as lib_stripe from "../lib/stripe.js";
import type * as lib_supportCopy from "../lib/supportCopy.js";
import type * as lib_vision from "../lib/vision.js";
import type * as lib_zonedTime from "../lib/zonedTime.js";
import type * as limits from "../limits.js";
import type * as locationProofs from "../locationProofs.js";
import type * as lockouts from "../lockouts.js";
import type * as migrations from "../migrations.js";
import type * as push from "../push.js";
import type * as raises from "../raises.js";
import type * as reminders from "../reminders.js";
import type * as revenuecat from "../revenuecat.js";
import type * as share from "../share.js";
import type * as stakes from "../stakes.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";
import type * as timerProofs from "../timerProofs.js";
import type * as users from "../users.js";
import type * as verifications from "../verifications.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accomplishments: typeof accomplishments;
  accountDeletion: typeof accountDeletion;
  accountNotices: typeof accountNotices;
  appVersion: typeof appVersion;
  calendar: typeof calendar;
  callOff: typeof callOff;
  chargeReviews: typeof chargeReviews;
  comebacks: typeof comebacks;
  commitmentChecks: typeof commitmentChecks;
  commitmentIcons: typeof commitmentIcons;
  commitmentIdeas: typeof commitmentIdeas;
  contracts: typeof contracts;
  crons: typeof crons;
  devProofs: typeof devProofs;
  devSeed: typeof devSeed;
  emails: typeof emails;
  endedHabits: typeof endedHabits;
  evidence: typeof evidence;
  freezes: typeof freezes;
  friends: typeof friends;
  goalSubmissions: typeof goalSubmissions;
  goals: typeof goals;
  graces: typeof graces;
  habitChecks: typeof habitChecks;
  habitHistory: typeof habitHistory;
  habitStreaks: typeof habitStreaks;
  habits: typeof habits;
  http: typeof http;
  "lib/accomplishmentSchema": typeof lib_accomplishmentSchema;
  "lib/auth": typeof lib_auth;
  "lib/callOff": typeof lib_callOff;
  "lib/chargeReviewSchema": typeof lib_chargeReviewSchema;
  "lib/comebackSchema": typeof lib_comebackSchema;
  "lib/comebacks": typeof lib_comebacks;
  "lib/commitmentIcons": typeof lib_commitmentIcons;
  "lib/commitmentLimits": typeof lib_commitmentLimits;
  "lib/commitmentText": typeof lib_commitmentText;
  "lib/contractSchema": typeof lib_contractSchema;
  "lib/customFunctions": typeof lib_customFunctions;
  "lib/days": typeof lib_days;
  "lib/emailCopy": typeof lib_emailCopy;
  "lib/endDate": typeof lib_endDate;
  "lib/endedHabitSchema": typeof lib_endedHabitSchema;
  "lib/ending": typeof lib_ending;
  "lib/entitlements": typeof lib_entitlements;
  "lib/frequency": typeof lib_frequency;
  "lib/grace": typeof lib_grace;
  "lib/graceCopy": typeof lib_graceCopy;
  "lib/graceSchema": typeof lib_graceSchema;
  "lib/habitHistory": typeof lib_habitHistory;
  "lib/habitWeek": typeof lib_habitWeek;
  "lib/invite": typeof lib_invite;
  "lib/lockout": typeof lib_lockout;
  "lib/notify": typeof lib_notify;
  "lib/openrouter": typeof lib_openrouter;
  "lib/photoOrigin": typeof lib_photoOrigin;
  "lib/places": typeof lib_places;
  "lib/proof": typeof lib_proof;
  "lib/proofMethods": typeof lib_proofMethods;
  "lib/reminderCopy": typeof lib_reminderCopy;
  "lib/reminderPlan": typeof lib_reminderPlan;
  "lib/reminderPresets": typeof lib_reminderPresets;
  "lib/reminderTimes": typeof lib_reminderTimes;
  "lib/stakeLadder": typeof lib_stakeLadder;
  "lib/stakeRules": typeof lib_stakeRules;
  "lib/stakeSchema": typeof lib_stakeSchema;
  "lib/stakes": typeof lib_stakes;
  "lib/streaks": typeof lib_streaks;
  "lib/stripe": typeof lib_stripe;
  "lib/supportCopy": typeof lib_supportCopy;
  "lib/vision": typeof lib_vision;
  "lib/zonedTime": typeof lib_zonedTime;
  limits: typeof limits;
  locationProofs: typeof locationProofs;
  lockouts: typeof lockouts;
  migrations: typeof migrations;
  push: typeof push;
  raises: typeof raises;
  reminders: typeof reminders;
  revenuecat: typeof revenuecat;
  share: typeof share;
  stakes: typeof stakes;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
  timerProofs: typeof timerProofs;
  users: typeof users;
  verifications: typeof verifications;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
