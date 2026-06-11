import React, { useEffect, useState } from 'react';
import { Megaphone, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { DealershipAnnouncement } from '../../../types';

interface DealershipAnnouncementSettingsProps {
  dealershipId: string;
  dealershipName: string;
  announcement?: DealershipAnnouncement | null;
  currentUserEmail?: string;
  onSave: (announcement: DealershipAnnouncement | null) => void | Promise<void>;
  saving?: boolean;
}

export function DealershipAnnouncementSettings({
  dealershipId,
  dealershipName,
  announcement,
  currentUserEmail,
  onSave,
  saving = false,
}: DealershipAnnouncementSettingsProps) {
  const [draft, setDraft] = useState(announcement?.message || '');
  const [enabled, setEnabled] = useState(announcement?.enabled ?? false);

  useEffect(() => {
    setDraft(announcement?.message || '');
    setEnabled(announcement?.enabled ?? false);
  }, [dealershipId, announcement?.message, announcement?.enabled, announcement?.updatedAt]);

  const publish = async () => {
    const message = draft.trim();
    if (!message) return;
    await onSave({
      message,
      enabled: true,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUserEmail,
    });
  };

  const clear = async () => {
    setDraft('');
    setEnabled(false);
    await onSave(null);
  };

  const toggleEnabled = async () => {
    const message = draft.trim() || announcement?.message?.trim() || '';
    if (!message) return;
    const next = !enabled;
    setEnabled(next);
    await onSave({
      message,
      enabled: next,
      updatedAt: announcement?.updatedAt || new Date().toISOString(),
      updatedBy: currentUserEmail,
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-[9px] font-black text-amber-300/90 uppercase tracking-widest italic flex items-center gap-2">
            <Megaphone size={12} />
            Live announcement — {dealershipName}
          </label>
          <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1 max-w-xl">
            Publishes a banner at the top of the app for all logged-in users at this store. Updates
            appear instantly without a refresh.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={saving || !(draft.trim() || announcement?.message?.trim())}
          className={cn(
            'w-11 h-6 rounded-full transition-colors relative shrink-0 disabled:opacity-40',
            enabled ? 'bg-amber-500' : 'bg-slate-800'
          )}
          title={enabled ? 'Hide banner' : 'Show banner'}
        >
          <span
            className={cn(
              'absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-all shadow-md',
              enabled ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder="e.g. Dispatch board layout updated — Tech Display is now available next to Display Preview."
        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 resize-y min-h-[4.5rem] focus:outline-none focus:ring-2 focus:ring-amber-500/25"
      />

      {announcement?.updatedAt ? (
        <p className="text-[9px] text-slate-600">
          Last published{' '}
          {new Date(announcement.updatedAt).toLocaleString()}
          {announcement.updatedBy ? ` · ${announcement.updatedBy}` : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={publish}
          disabled={saving || !draft.trim()}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-[10px] font-black uppercase tracking-wider text-slate-950 transition-colors"
        >
          Publish announcement
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-rose-300 hover:border-rose-900/40 transition-colors"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>
    </div>
  );
}
