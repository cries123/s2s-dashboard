import { useEffect, useState } from 'react';
import type { DealershipChatMessage } from '../types';
import { subscribeDealershipInbox } from '../lib/dealershipChat';

export function useDealershipChatInbox(
  dealershipId: string | undefined,
  uid: string | undefined
) {
  const [inbox, setInbox] = useState<DealershipChatMessage[]>([]);

  useEffect(() => {
    if (!dealershipId || !uid) {
      setInbox([]);
      return;
    }

    const unsub = subscribeDealershipInbox(dealershipId, uid, setInbox, (err) =>
      console.error('[DealershipChat] inbox error', err)
    );
    return () => unsub();
  }, [dealershipId, uid]);

  const unreadCount = inbox.filter((msg) => !msg.dismissedAt).length;

  return { inbox, unreadCount };
}
