import React from 'react';
import { PROMISE_BUSINESS_HOURS_LABEL, PROMISE_TIME_MAX, PROMISE_TIME_MIN } from '../../../lib/dispatchPromiseTime';

interface DispatchPromiseTimeInputProps {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  error?: string | null;
  compact?: boolean;
  showHint?: boolean;
}

export function DispatchPromiseTimeInput({
  date,
  time,
  onDateChange,
  onTimeChange,
  error,
  compact = false,
  showHint = true,
}: DispatchPromiseTimeInputProps) {
  const inputClass = compact
    ? 'w-full min-w-0 bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-2 py-1.5 text-[11px] text-white font-semibold tabular-nums [color-scheme:dark]'
    : 'w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white font-semibold tabular-nums [color-scheme:dark]';

  return (
    <div className="space-y-1.5">
      <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-3'}>
        <div className="space-y-1 min-w-0">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">
            Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1 min-w-0">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">
            Time
          </span>
          <input
            type="time"
            value={time}
            min={PROMISE_TIME_MIN}
            max={PROMISE_TIME_MAX}
            step={60}
            onChange={(e) => onTimeChange(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      {showHint && (
        <p className={`text-slate-600 pl-0.5 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
          Promise window: {PROMISE_BUSINESS_HOURS_LABEL}
        </p>
      )}
      {error && (
        <p className={`text-rose-400 font-medium pl-0.5 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
          {error}
        </p>
      )}
    </div>
  );
}
