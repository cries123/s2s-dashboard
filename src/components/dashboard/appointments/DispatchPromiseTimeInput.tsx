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
    ? 'input-field min-w-0 !px-2 text-xs font-semibold tabular-nums'
    : 'input-field font-semibold tabular-nums';

  return (
    <div className="space-y-1.5">
      <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-3'}>
        <div className="space-y-1 min-w-0">
          <span className="text-xs font-semibold text-slate-500 block pl-0.5">
            Date
          </span>
          <input
            type="date"
            aria-label="Promise date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1 min-w-0">
          <span className="text-xs font-semibold text-slate-500 block pl-0.5">
            Time
          </span>
          <input
            type="time"
            aria-label="Promise time"
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
        <p className={`text-slate-600 pl-0.5 ${compact ? 'text-xs' : 'text-xs'}`}>
          Promise window: {PROMISE_BUSINESS_HOURS_LABEL}
        </p>
      )}
      {error && (
        <p className={`text-rose-400 font-medium pl-0.5 ${compact ? 'text-xs' : 'text-xs'}`}>
          {error}
        </p>
      )}
    </div>
  );
}
