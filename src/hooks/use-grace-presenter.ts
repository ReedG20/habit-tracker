import { useQuery } from 'convex/react';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { api } from '@/convex/_generated/api';
import { openGrace } from '@/lib/grace-screen';

/**
 * Opens the one-time reprieve's page, full screen, the first time it's there
 * to see: on launch, or the moment it lands while the app is open. Never over
 * a loss or a commitment being signed; it waits for the next screen change.
 */
export function useGracePresenter() {
  const grace = useQuery(api.graces.unseen);
  const pathname = usePathname();
  const presented = useRef(new Set<string>());

  useEffect(() => {
    if (grace == null) return;
    const id = grace.graceId;
    const busy =
      pathname.startsWith('/grace') ||
      pathname.startsWith('/lost') ||
      pathname === '/new' ||
      pathname.endsWith('/prove') ||
      pathname.endsWith('/submit');
    if (presented.current.has(id) || busy) return;
    presented.current.add(id);
    openGrace(id);
  }, [grace, pathname]);
}
