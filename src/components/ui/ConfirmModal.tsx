import React, { useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="modal-content !max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={description ? 'confirm-modal-description' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start gap-3 p-5 sm:p-6 border-b"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          {tone === 'danger' && (
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-rose-500" />
            </div>
          )}
          <h2
            id="confirm-modal-title"
            className="text-lg font-black leading-snug"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {title}
          </h2>
        </div>

        {/* Body */}
        {description && (
          <div className="p-5 sm:p-6">
            <p
              id="confirm-modal-description"
              className="text-sm leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {description}
            </p>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-5 sm:p-6 border-t"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary px-4 py-2.5 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none',
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-brand-primary hover:bg-brand-secondary text-white'
            )}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
