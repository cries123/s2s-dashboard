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

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof CheckCircle2; classes: string }> = {
  success: {
    icon: CheckCircle2,
    classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  error: {
    icon: XCircle,
    classes: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },
  info: {
    icon: Info,
    classes: 'bg-brand-primary/10 text-brand-primary border-brand-primary/20',
  },
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

  const showToast = useCallback(
    (text: string, variant: ToastVariant = 'success') => {
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
        className="fixed top-4 inset-x-4 sm:inset-x-auto sm:left-auto sm:right-4 z-[10000] flex flex-col gap-2 sm:w-96 max-w-full pointer-events-none"
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
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-lg backdrop-blur-sm animate-slide-in',
                style.classes
              )}
            >
              <Icon size={18} className="shrink-0 mt-0.5" />
              <span className="flex-1 text-sm font-semibold leading-snug">{toast.text}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100 transition-opacity"
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
