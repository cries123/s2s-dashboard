import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  text: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Push a toast onto the stack. Auto-dismisses after 5s; user can also dismiss manually. */
  showToast: (text: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof CheckCircle2; iconClass: string; accent: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-emerald-500', accent: 'var(--color-success, #10b981)' },
  error: { icon: XCircle, iconClass: 'text-rose-500', accent: '#f43f5e' },
  info: { icon: Info, iconClass: 'text-brand-primary', accent: 'var(--color-brand-primary)' },
};

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const lastToast = useRef<{ text: string; variant: ToastVariant; at: number } | null>(null);

  const showToast = useCallback(
    (text: string, variant: ToastVariant = 'success') => {
      // A failing listener can report the same error many times a second. Show it
      // once; stacking ten identical toasts tells the user nothing more.
      const now = Date.now();
      const last = lastToast.current;
      if (last && last.text === text && last.variant === variant && now - last.at < 2500) return;
      lastToast.current = { text, variant, at: now };

      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, text, variant }]);
      const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed inset-x-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.75rem)] lg:bottom-auto lg:top-4 sm:left-auto sm:right-4 z-[10000] flex flex-col gap-2 sm:w-96 max-w-full pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const style = VARIANT_STYLES[toast.variant];
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-lg border border-l-[3px] p-3.5 shadow-lg animate-slide-in"
              style={{
                backgroundColor: 'var(--color-surface-card)',
                borderColor: 'var(--color-surface-border)',
                borderLeftColor: style.accent,
                color: 'var(--color-text-primary)',
              }}
            >
              <Icon size={18} className={cn('shrink-0 mt-0.5', style.iconClass)} />
              <span className="flex-1 text-sm font-medium leading-snug">{toast.text}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-md p-1 -m-1 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
