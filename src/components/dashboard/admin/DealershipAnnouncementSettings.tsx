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
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <Megaphone size={14} style={{ color: 'var(--color-text-secondary)' }} />
            {dealershipName}
          </p>
          <p className="crm-label mt-0.5 max-w-xl">A banner at the top of the app for everyone signed in at this store.</p>
        </div>
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={saving || !(draft.trim() || announcement?.message?.trim())}
          className={cn(
            'tap-expand w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40',
            enabled ? 'bg-brand-primary' : ''
          )}
          style={enabled ? undefined : { backgroundColor: 'var(--color-input-border)' }}
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? 'Hide banner' : 'Show banner'}
          title={enabled ? 'Hide banner' : 'Show banner'}
        >
          <span
            style={{ backgroundColor: '#fff' }}
            className={cn(
              'absolute top-1 left-1 w-4 h-4 rounded-full transition-all shadow',
              enabled ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder="Service drive closes at 4 PM on Friday."
        aria-label="Announcement text"
        className="input-field resize-y min-h-[4.5rem]"
      />

      {announcement?.updatedAt ? (
        <p className="crm-label">
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
          className="btn-primary disabled:opacity-40"
        >
          Publish
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={saving}
          className="btn-secondary"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>
    </div>
  );
}
