/// <reference types="vite/client" />
// Multi-dot filename on purpose: the Convex bundler skips those, and this file
// must never be deployed as a function module (`import.meta.glob` is Vite-only).
import { convexTest, type TestConvex } from 'convex-test';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

export type Harness = TestConvex<typeof schema>;

export function setup(): Harness {
  return convexTest(schema, modules);
}

/** A signed-in client for `tokenIdentifier`, with its `users` row already stored. */
export async function signIn(t: Harness, tokenIdentifier: string) {
  const as = t.withIdentity({ tokenIdentifier, name: tokenIdentifier });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, {});
  return { as, userId };
}

export const TODAY = '2026-09-21';
