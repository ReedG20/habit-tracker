import { useQuery } from 'convex/react';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { api } from '@/convex/_generated/api';
import { openKept } from '@/lib/kept-screen';

/**
 * Opens the Kept screen, full page, the first time a commitment seen through
 * is there to celebrate: on launch, or the moment a goal's proof is approved.
 * A loss or the one-time reprieve outranks it, and it never opens over a
 * commitment being signed or proved; it waits for the next screen change instead.
 */
export function useKeptPresenter() {
  const kept = useQuery(api.accomplishments.unseen);
  const loss = useQuery(api.stakes.unseenLoss);
  const grace = useQuery(api.graces.unseen);
  const pathname = usePathname();
  const presented = useRef(new Set<string>());

  useEffect(() => {
    if (kept == null || loss !== null || grace !== null) return;
    const id = kept._id;
    const busy =
      pathname.startsWith('/lost') ||
      pathname.startsWith('/kept') ||
      pathname.startsWith('/grace') ||
      pathname === '/pro' ||
      pathname === '/new' ||
      pathname.endsWith('/prove') ||
      pathname.endsWith('/submit');
    if (presented.current.has(id) || busy) return;
    presented.current.add(id);
    openKept(id);
  }, [kept, loss, grace, pathname]);
}
