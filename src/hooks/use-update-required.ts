import { useQuery } from 'convex/react';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { api } from '@/convex/_generated/api';
import { isBelowMinimum, parseBuild } from '@/lib/app-version';

export type UpdateRequired = { build: number; minimum: number };

const build = Platform.OS === 'ios' ? parseBuild(Application.nativeBuildVersion) : null;

/**
 * Set when this iOS build is older than the server's `MIN_IOS_BUILD`, so the
 * app has to be updated before it can be used. Live: raising the minimum
 * reaches people already in the app. Loading, offline and an unset minimum
 * all mean no gate, so the backend can never lock anyone out by accident.
 */
export function useUpdateRequired(): UpdateRequired | null {
  const minimum = useQuery(api.appVersion.minimumIosBuild, build === null ? 'skip' : {}) ?? null;
  return build !== null && minimum !== null && isBelowMinimum(build, minimum)
    ? { build, minimum }
    : null;
}
