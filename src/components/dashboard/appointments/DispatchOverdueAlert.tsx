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
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-500/50 bg-rose-950/50 text-rose-200 animate-pulse"
      >
        <AlertTriangle size={14} className="text-rose-400 shrink-0" />
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
        'px-4 py-4 sm:px-5 shadow-lg shadow-rose-950/30 animate-pulse'
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-500/40 shrink-0">
            <AlertTriangle size={20} className="text-rose-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
              Promise time alert
            </p>
            <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight mt-0.5">
              {countLabel} past promise
            </h2>
            <p className="text-xs text-rose-200/80 mt-1">
              Customer promise times have passed. Prioritize these ROs or update the promise time.
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-2 sm:min-w-[280px] sm:max-w-md">
          {overdue.slice(0, 6).map(({ ro, state }) => (
            <li key={ro.id}>
              <button
                type="button"
                onClick={() => onSelectRo?.(ro)}
                className={cn(
                  'w-full text-left rounded-xl border border-rose-500/35 bg-rose-950/40 px-3 py-2.5',
                  'hover:bg-rose-900/40 hover:border-rose-400/50 transition-colors',
                  onSelectRo && 'cursor-pointer'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-white tabular-nums">{ro.roNumber}</span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-rose-300 shrink-0">
                    {state.countdownLabel}
                  </span>
                </div>
                <p className="text-[10px] text-rose-100/90 truncate mt-0.5">
                  {ro.customerName || ro.customerLastName || 'Guest'}
                  <span className="text-rose-300/70"> · {dispatchLaneLabel(ro.department)}</span>
                </p>
              </button>
            </li>
          ))}
          {overdue.length > 6 ? (
            <li className="text-[10px] text-rose-300/80 font-bold px-1">
              +{overdue.length - 6} more overdue — use RO search to find them
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
