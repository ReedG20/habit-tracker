import { afterEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import { setup } from './test.helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('minimumIosBuild', () => {
  test('is null when unset', async () => {
    const t = setup();
    expect(await t.query(api.appVersion.minimumIosBuild, {})).toBeNull();
  });

  test('is the build number when set', async () => {
    vi.stubEnv('MIN_IOS_BUILD', ' 42 ');
    const t = setup();
    expect(await t.query(api.appVersion.minimumIosBuild, {})).toBe(42);
  });

  test.each(['', 'abc', '1.0.0', '-3', '0', '12abc'])('ignores %j', async (value) => {
    vi.stubEnv('MIN_IOS_BUILD', value);
    const t = setup();
    expect(await t.query(api.appVersion.minimumIosBuild, {})).toBeNull();
  });
});
