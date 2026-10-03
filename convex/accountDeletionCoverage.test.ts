/// <reference types="vite/client" />
import type { GenericValidator } from 'convex/values';
import { describe, expect, test } from 'vitest';

import purgeSource from './accountDeletion.ts?raw';
import schema from './schema';

/**
 * An invariant, not a scenario: every table that can hold a user's id must be
 * purged by `accountDeletion.ts` (its `STEPS`). Derived from the schema itself,
 * so a new user-owned table fails here until it gets a purge step, instead of
 * quietly surviving account deletion (Apple guideline 5.1.1(v)).
 *
 * The behavioral test (`accountDeletion.test.ts`) seeds one of everything it
 * knows about; this one catches what it doesn't know about yet.
 */

/** Tables that may point at a user and are deliberately kept, with why. */
const KEPT_ON_PURPOSE: Record<string, string> = {
  // Deleted last by `purgeBatch` itself, once every other row is gone.
  users: 'the account row, deleted last',
};

/** Whether `validator` is, or contains (optional, union, nested object, array), an id of `users`. */
function holdsUserId(validator: GenericValidator): boolean {
  switch (validator.kind) {
    case 'id':
      return validator.tableName === 'users';
    case 'object':
      return Object.values(validator.fields as Record<string, GenericValidator>).some(holdsUserId);
    case 'union':
      return (validator.members as GenericValidator[]).some(holdsUserId);
    case 'array':
      return holdsUserId(validator.element as GenericValidator);
    case 'record':
      return holdsUserId(validator.value as GenericValidator);
    default:
      return false;
  }
}

const userOwnedTables = Object.entries(schema.tables)
  .filter(([, table]) => holdsUserId(table.validator as GenericValidator))
  .map(([name]) => name)
  .sort();

/** Tables the purge reads rows from: `.query('table')`. */
const purgedTables = new Set(
  [...purgeSource.matchAll(/\.query\(\s*['"](\w+)['"]\s*\)/g)].map((match) => match[1]),
);

describe('account deletion coverage', () => {
  test('the schema walk finds the user-owned tables (sanity check)', () => {
    // If this fails, the walk above broke, not the purge.
    for (const table of ['habits', 'goals', 'stakes', 'chargeReviews', 'graces', 'pushTokens']) {
      expect(userOwnedTables).toContain(table);
    }
    for (const table of ['stripeEvents', 'revenuecatEvents', 'graceMarks', 'emailSuppressions']) {
      expect(userOwnedTables).not.toContain(table);
    }
  });

  test.each(userOwnedTables.filter((table) => !(table in KEPT_ON_PURPOSE)))(
    '`%s` has a purge step in accountDeletion.ts',
    (table) => {
      expect(
        purgedTables.has(table),
        `${table} holds a user id but accountDeletion.ts never queries it: add a step to STEPS ` +
          '(and a row to the seed in accountDeletion.test.ts), or list it in KEPT_ON_PURPOSE with why',
      ).toBe(true);
    },
  );

  test('the users row itself is deleted', () => {
    expect(purgeSource).toMatch(/ctx\.db\.delete\(\s*'users'/);
  });

  test('nothing is listed as kept that no longer exists', () => {
    for (const table of Object.keys(KEPT_ON_PURPOSE)) {
      expect(Object.keys(schema.tables)).toContain(table);
    }
  });
});
