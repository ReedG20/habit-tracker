import { useQuery } from 'convex/react';
import { router, usePathname, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { api } from '@/convex/_generated/api';

/**
 * Opens the loss screen, full page, the first time a lost stake is there to
 * see: on launch, or the moment it lands while the app is open. Each loss is
 * shown once per session; the screen marks it seen when it's answered.
 */
export function useLossPresenter() {
  const loss = useQuery(api.stakes.unseenLoss);
  const pathname = usePathname();
  const presented = useRef(new Set<string>());

  useEffect(() => {
    if (loss == null) return;
    const id = loss.stake._id;
    // Not over the top of a commitment being signed, nor a second copy of itself.
    if (presented.current.has(id) || pathname.startsWith('/lost') || pathname === '/new') return;
    presented.current.add(id);
    router.push(`/lost/${id}` as Href);
  }, [loss, pathname]);
}
