import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface WeekDayRow {
  date: string;
  label: string;
  monthLabel: string;
  dayNum: number;
  count: number;
  hasData: boolean;
  isWeekend: boolean;
}

interface OperationsWeekGridProps {
  weekDays: WeekDayRow[];
  weekOffset: number;
  targetValue: number;
  selectedDate: string;
  savingDate: string | null;
  onWeekOffsetChange: (offset: number | ((prev: number) => number)) => void;
  onSelectDate: (date: string, count: number, hasSavedRow: boolean) => void;
  onSaveDayCount: (date: string, count: number) => Promise<void>;
  onViewBreakdown: (date: string) => void;
  hasBreakdown: (date: string) => boolean;
}

export function OperationsWeekGrid({
  weekDays,
  weekOffset,
  targetValue,
  selectedDate,
  savingDate,
  onWeekOffsetChange,
  onSelectDate,
  onSaveDayCount,
  onViewBreakdown,
  hasBreakdown,
}: OperationsWeekGridProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const displayValue = (day: WeekDayRow) => {
    if (drafts[day.date] !== undefined) return drafts[day.date];
    return day.count > 0 ? String(day.count) : '';
  };

  const commitDraft = async (day: WeekDayRow) => {
    const raw = drafts[day.date];
    if (raw === undefined) return;

    const trimmed = raw.trim();
    const parsed = trimmed === '' ? 0 : parseInt(trimmed, 10);
    if (trimmed !== '' && (Number.isNaN(parsed) || parsed < 0)) return;

    setDrafts((prev) => {
      const next = { ...prev };
      delete next[day.date];
      return next;
    });

    if (parsed === day.count) return;
    await onSaveDayCount(day.date, parsed);
  };

  return (
    <div className="card-base overflow-hidden">
      <div
        className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <div>
          <h3 className="crm-section-title flex items-center gap-2">
            <CalendarIcon size={16} className="text-brand-primary" />
            Week at a glance
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">Click a row or type directly in Scheduled to update.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onWeekOffsetChange((p) => p - 1)}
            className="btn-secondary p-2"
            aria-label="Previous week"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => onWeekOffsetChange(0)}
            className={cn('btn-secondary px-3 py-2 text-xs', weekOffset === 0 && 'border-brand-primary/40 text-brand-primary')}
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => onWeekOffsetChange((p) => p + 1)}
            className="btn-secondary p-2"
            aria-label="Next week"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Date</th>
              <th className="text-right w-36">Scheduled</th>
              <th className="text-right">vs goal ({targetValue})</th>
              <th className="text-right">Breakdown</th>
            </tr>
          </thead>
          <tbody>
            {weekDays.map((day) => {
              const isSelected = selectedDate === day.date;
              const isSaving = savingDate === day.date;
              const draftVal = displayValue(day);
              const displayCount = draftVal !== '' ? parseInt(draftVal, 10) || 0 : day.count;
              const showVsGoal = day.hasData || draftVal !== '';
              const vsGoal = showVsGoal ? displayCount - targetValue : null;

              return (
                <tr
                  key={day.date}
                  className={cn(
                    'transition-colors',
                    isSelected && 'bg-brand-primary/5',
                    day.isWeekend && 'opacity-70'
                  )}
                >
                  <td className="font-medium">{day.label}</td>
                  <td className="crm-label">
                    {day.monthLabel} {day.dayNum}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isSaving && <Loader2 size={14} className="animate-spin text-brand-primary" />}
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={draftVal}
                        placeholder="—"
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [day.date]: e.target.value,
                          }))
                        }
                        onFocus={() => onSelectDate(day.date, day.count, day.hasData)}
                        onBlur={() => void commitDraft(day)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                        className={cn(
                          'w-20 rounded-lg border bg-slate-950 px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-white',
                          'border-slate-700 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20',
                          isSelected && 'border-brand-primary/50'
                        )}
                      />
                    </div>
                  </td>
                  <td
                    className={cn(
                      'text-right tabular-nums text-sm',
                      vsGoal === null
                        ? 'text-slate-600'
                        : vsGoal < 0
                          ? 'text-rose-400'
                          : vsGoal === 0
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                    )}
                  >
                    {vsGoal === null ? '—' : vsGoal > 0 ? `+${vsGoal}` : vsGoal}
                  </td>
                  <td className="text-right">
                    {hasBreakdown(day.date) ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-brand-primary hover:underline"
                        onClick={() => onViewBreakdown(day.date)}
                      >
                        View
                      </button>
                    ) : (
                      <span className="crm-label">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
