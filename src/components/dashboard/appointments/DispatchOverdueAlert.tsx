import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { dispatchLaneLabel } from '../../../lib/dispatchConfig';
import type { OverdueDispatchOrder } from '../../../lib/dispatchPromiseTime';
import type { DispatchRepairOrder } from '../../../types';
import { cn } from '../../../lib/utils';

interface DispatchOverdueAlertProps {
  overdue: OverdueDispatchOrder[];
  onSelectRo?: (ro: DispatchRepairOrder) => void;
  compact?: boolean;
}

export function DispatchOverdueAlert({
  overdue,
  onSelectRo,
  compact = false,
}: DispatchOverdueAlertProps) {
  if (overdue.length === 0) return null;

  const countLabel = overdue.length === 1 ? '1 repair order' : `${overdue.length} repair orders`;

  if (compact) {
    return (
      <div
        role="alert"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-500/50 bg-rose-950/50 text-rose-200"
      >
        <AlertTriangle size={14} className="text-rose-400 shrink-0 animate-pulse" />
        <span className="text-[10px] font-black uppercase tracking-wider">
          {countLabel} overdue
        </span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        'rounded-2xl border-2 border-rose-500/60 bg-gradient-to-r from-rose-950/80 via-rose-950/50 to-slate-950/80',
        'px-4 py-3 sm:px-5 shadow-lg shadow-rose-950/30'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-500/40 shrink-0">
          <AlertTriangle size={18} className="text-rose-400 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
                Promise time alert
              </p>
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-tight mt-0.5">
                {countLabel} past promise
              </h2>
            </div>
            <p className="text-[10px] font-bold text-rose-300/90 shrink-0 tabular-nums">
              Scroll →
            </p>
          </div>
          <p className="text-[11px] text-rose-200/75 mt-1">
            Prioritize these ROs or update promise times. Click a card to jump to it.
          </p>

          <div className="mt-3 -mx-1 overflow-x-auto pb-1">
            <ul className="flex gap-2 min-w-min px-1">
              {overdue.map(({ ro, state }) => (
                <li key={ro.id} className="shrink-0 w-[11.5rem] snap-start">
                  <button
                    type="button"
                    onClick={() => onSelectRo?.(ro)}
                    className={cn(
                      'w-full text-left rounded-xl border border-rose-500/35 bg-rose-950/50 px-2.5 py-2',
                      'hover:bg-rose-900/50 hover:border-rose-400/50 transition-colors',
                      onSelectRo && 'cursor-pointer'
                    )}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-black text-white tabular-nums truncate">
                        {ro.roNumber}
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-wider text-rose-300 shrink-0">
                        {state.countdownLabel}
                      </span>
                    </div>
                    <p className="text-[9px] text-rose-100/90 truncate mt-0.5 leading-snug">
                      {ro.customerName || ro.customerLastName || 'Guest'}
                    </p>
                    <p className="text-[8px] font-bold uppercase tracking-wider text-rose-400/80 truncate mt-0.5">
                      {dispatchLaneLabel(ro.department)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
