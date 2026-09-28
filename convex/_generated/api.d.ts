/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountNotices from "../accountNotices.js";
import type * as commitmentChecks from "../commitmentChecks.js";
import type * as crons from "../crons.js";
import type * as goalSubmissions from "../goalSubmissions.js";
import type * as goals from "../goals.js";
import type * as habits from "../habits.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_commitmentText from "../lib/commitmentText.js";
import type * as lib_customFunctions from "../lib/customFunctions.js";
import type * as lib_days from "../lib/days.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_frequency from "../lib/frequency.js";
import type * as lib_lockout from "../lib/lockout.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_openrouter from "../lib/openrouter.js";
import type * as lib_reminderCopy from "../lib/reminderCopy.js";
import type * as lib_reminderPlan from "../lib/reminderPlan.js";
import type * as lib_reminderPresets from "../lib/reminderPresets.js";
import type * as lib_reminderTimes from "../lib/reminderTimes.js";
import type * as lib_stripe from "../lib/stripe.js";
import type * as lib_vision from "../lib/vision.js";
import type * as lib_zonedTime from "../lib/zonedTime.js";
import type * as lockouts from "../lockouts.js";
import type * as push from "../push.js";
import type * as reminders from "../reminders.js";
import type * as revenuecat from "../revenuecat.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";
import type * as users from "../users.js";
import type * as verifications from "../verifications.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountNotices: typeof accountNotices;
  commitmentChecks: typeof commitmentChecks;
  crons: typeof crons;
  goalSubmissions: typeof goalSubmissions;
  goals: typeof goals;
  habits: typeof habits;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/commitmentText": typeof lib_commitmentText;
  "lib/customFunctions": typeof lib_customFunctions;
  "lib/days": typeof lib_days;
  "lib/entitlements": typeof lib_entitlements;
  "lib/frequency": typeof lib_frequency;
  "lib/lockout": typeof lib_lockout;
  "lib/notify": typeof lib_notify;
  "lib/openrouter": typeof lib_openrouter;
  "lib/reminderCopy": typeof lib_reminderCopy;
  "lib/reminderPlan": typeof lib_reminderPlan;
  "lib/reminderPresets": typeof lib_reminderPresets;
  "lib/reminderTimes": typeof lib_reminderTimes;
  "lib/stripe": typeof lib_stripe;
  "lib/vision": typeof lib_vision;
  "lib/zonedTime": typeof lib_zonedTime;
  lockouts: typeof lockouts;
  push: typeof push;
  reminders: typeof reminders;
  revenuecat: typeof revenuecat;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
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
};
