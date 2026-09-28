import React from 'react';
import { BrandMark } from './BrandMark';

/**
 * Shown while the session and first data load. It used to be an orbiting,
 * glowing "Initializing Systems" sequence with a made-up "Archive Hub · v2.4.0 ·
 * Operational" strip — the most sci-fi screen in the app, and the first one
 * anyone sees after signing in. Now: the mark, a quiet spinner, one word.
 */
export function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5"
      style={{ backgroundColor: 'var(--color-surface-base)' }}
      role="status"
      aria-live="polite"
    >
      <BrandMark size={48} />
      <div className="flex items-center gap-2.5">
        <span
          className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin motion-reduce:animate-none"
          style={{ borderColor: 'var(--color-brand-primary)', borderTopColor: 'transparent' }}
          aria-hidden="true"
        />
        <span className="crm-label text-sm">Loading</span>
      </div>
    </div>
  );
}
