/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as goalSubmissions from "../goalSubmissions.js";
import type * as goals from "../goals.js";
import type * as habits from "../habits.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_customFunctions from "../lib/customFunctions.js";
import type * as lib_days from "../lib/days.js";
import type * as lib_stripe from "../lib/stripe.js";
import type * as lib_vision from "../lib/vision.js";
import type * as stripe from "../stripe.js";
import type * as users from "../users.js";
import type * as verifications from "../verifications.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  goalSubmissions: typeof goalSubmissions;
  goals: typeof goals;
  habits: typeof habits;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/customFunctions": typeof lib_customFunctions;
  "lib/days": typeof lib_days;
  "lib/stripe": typeof lib_stripe;
  "lib/vision": typeof lib_vision;
  stripe: typeof stripe;
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

export declare const components: {};
