import { expect, test } from 'vitest';

import { api } from './_generated/api';
import { setup, signIn } from './test.helpers';

test('saveOnboarding records the survey on the signed-in user', async () => {
  const t = setup();
  const { as, userId } = await signIn(t, 'alice');

  await as.mutation(api.users.saveOnboarding, {
    areas: ['fitness', 'learning', 'fitness'],
    history: 'fades',
    motivator: 'money',
  });

  const user = await t.run((ctx) => ctx.db.get('users', userId));
  expect(user?.onboarding).toMatchObject({
    areas: ['fitness', 'learning'],
    history: 'fades',
    motivator: 'money',
  });
  expect(user?.onboarding?.completedAt).toBeTypeOf('number');
});

test('saveOnboarding refuses a signed-out caller', async () => {
  const t = setup();
  await expect(t.mutation(api.users.saveOnboarding, { areas: [] })).rejects.toThrow();
});
