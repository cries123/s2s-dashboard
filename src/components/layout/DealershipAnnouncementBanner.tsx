import React, { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import type { DealershipAnnouncement } from '../../types';
import { cn } from '../../lib/utils';

function dismissStorageKey(dealershipId: string, updatedAt: string) {
  return `announcement-dismissed:${dealershipId}:${updatedAt}`;
}

interface DealershipAnnouncementBannerProps {
  dealershipId: string;
  announcement?: DealershipAnnouncement | null;
  className?: string;
}

export function DealershipAnnouncementBanner({
  dealershipId,
  announcement,
  className,
}: DealershipAnnouncementBannerProps) {
  const message = announcement?.message?.trim() || '';
  const updatedAt = announcement?.updatedAt || '';
  const enabled = announcement?.enabled && message.length > 0;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled || !updatedAt) {
      setDismissed(false);
      return;
    }
    setDismissed(sessionStorage.getItem(dismissStorageKey(dealershipId, updatedAt)) === '1');
  }, [dealershipId, updatedAt, enabled]);

  if (!enabled || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'shrink-0 border-b border-amber-500/25 bg-gradient-to-r from-amber-950/90 via-amber-900/40 to-slate-950/90',
        className
      )}
    >
      <div className="px-4 sm:px-6 py-2.5 flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 shrink-0 mt-0.5">
          <Megaphone size={14} className="text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/90 mb-0.5">
            Team announcement
          </p>
          <p className="text-sm font-medium text-amber-50 leading-relaxed whitespace-pre-wrap break-words">
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (updatedAt) {
              sessionStorage.setItem(dismissStorageKey(dealershipId, updatedAt), '1');
            }
            setDismissed(true);
          }}
          className="shrink-0 p-1.5 rounded-lg text-amber-300/70 hover:text-amber-100 hover:bg-amber-500/10 transition-colors"
          aria-label="Dismiss announcement"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
