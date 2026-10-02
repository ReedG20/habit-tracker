import { useQuery } from 'convex/react';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { api } from '@/convex/_generated/api';
import { openMilestone } from '@/lib/milestone-screen';

/**
 * Opens a streak milestone's moment, full page, the first time it's there:
 * right after the proof that reached it closes, or on the next launch when a
 * photo was judged in the background. A loss, the one-time reprieve and a
 * Kept page all go first, and it never opens over a commitment being signed
 * or proved; it waits for the next screen change instead.
 */
export function useMilestonePresenter() {
  const milestone = useQuery(api.milestones.unseen);
  const kept = useQuery(api.accomplishments.unseen);
  const loss = useQuery(api.stakes.unseenLoss);
  const grace = useQuery(api.graces.unseen);
  const pathname = usePathname();
  const presented = useRef(new Set<string>());

  useEffect(() => {
    if (milestone == null || kept !== null || loss !== null || grace !== null) return;
    const id = milestone._id;
    const busy =
      pathname.startsWith('/lost') ||
      pathname.startsWith('/kept') ||
      pathname.startsWith('/grace') ||
      pathname.startsWith('/milestone') ||
      pathname.startsWith('/share') ||
      pathname === '/pro' ||
      pathname === '/new' ||
      pathname.endsWith('/prove') ||
      pathname.endsWith('/submit');
    if (presented.current.has(id) || busy) return;
    presented.current.add(id);
    openMilestone(id);
  }, [milestone, kept, loss, grace, pathname]);
}
