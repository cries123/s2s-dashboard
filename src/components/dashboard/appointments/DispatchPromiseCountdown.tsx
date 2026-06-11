import React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  getPromiseTimeState,
  PROMISE_URGENCY_STYLES,
  type PromiseTimeState,
} from '../../../lib/dispatchPromiseTime';

interface DispatchPromiseCountdownProps {
  promiseTimeAt?: string;
  nowMs: number;
  compact?: boolean;
  className?: string;
}

export function usePromiseTimeState(
  promiseTimeAt: string | undefined,
  nowMs: number
): PromiseTimeState | null {
  return React.useMemo(
    () => getPromiseTimeState(promiseTimeAt, nowMs),
    [promiseTimeAt, nowMs]
  );
}

export function DispatchPromiseCountdown({
  promiseTimeAt,
  nowMs,
  compact = false,
  className,
}: DispatchPromiseCountdownProps) {
  const state = usePromiseTimeState(promiseTimeAt, nowMs);
  if (!state) return null;

  const styles = PROMISE_URGENCY_STYLES[state.urgency];

  if (compact) {
    return (
      <div
        className={cn(
          'rounded-lg border px-2.5 py-2 space-y-1',
          styles.bg,
          styles.border,
          state.urgency === 'overdue' && 'animate-pulse',
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">Promise</span>
          <Clock size={10} className={cn('shrink-0', styles.text)} />
        </div>
        <p className={cn('text-[11px] font-bold tabular-nums leading-tight', styles.text)}>
          {state.countdownLabel}
        </p>
        <p className={cn('text-[10px] font-medium tabular-nums leading-tight', styles.text, 'opacity-90')}>
          {state.scheduledLabel}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2 space-y-0.5',
        styles.bg,
        styles.border,
        state.urgency === 'overdue' && 'animate-pulse',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Promise</span>
        <Clock size={11} className={cn('shrink-0', styles.text)} />
      </div>
      <p className={cn('text-[11px] font-bold tabular-nums', styles.text)}>{state.countdownLabel}</p>
      <p className="text-[9px] text-slate-500 font-medium truncate">{state.scheduledLabel}</p>
    </div>
  );
}
