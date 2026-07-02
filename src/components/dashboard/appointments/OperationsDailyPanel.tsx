import React from 'react';
import { ChevronLeft, ChevronRight, Save, Loader2, FileUp, PieChart } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface OperationsDailyPanelProps {
  selectedDate: string;
  dailyCount: string;
  saving: boolean;
  isUploadingPdf: boolean;
  targetValue: number;
  onDateChange: (date: string) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onCountChange: (value: string) => void;
  onQuickSave: () => void;
  onOpenBreakdown: () => void;
  onPdfClick: () => void;
}

function formatDisplayDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function OperationsDailyPanel({
  selectedDate,
  dailyCount,
  saving,
  isUploadingPdf,
  targetValue,
  onDateChange,
  onPrevDay,
  onNextDay,
  onCountChange,
  onQuickSave,
  onOpenBreakdown,
  onPdfClick,
}: OperationsDailyPanelProps) {
  const parsed = parseInt(dailyCount, 10);
  const hasValue = dailyCount.trim() !== '' && !Number.isNaN(parsed) && parsed >= 0;
  const vsGoal = hasValue ? parsed - targetValue : null;

  return (
    <div className="card-base overflow-hidden">
      <div className="border-b px-5 py-4 sm:px-6" style={{ borderColor: 'var(--color-surface-border)' }}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Log scheduled appointments</p>
            <h2 className="text-lg font-semibold text-white">{formatDisplayDate(selectedDate)}</h2>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-brand-primary/25 bg-brand-primary/10 px-3 py-1 text-xs font-medium text-brand-primary">
            Daily goal: {targetValue}
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-5">
          <div>
            <label htmlFor="ops-date" className="input-label">
              Date
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrevDay}
                className="btn-secondary shrink-0 p-2.5"
                aria-label="Previous day"
              >
                <ChevronLeft size={18} />
              </button>
              <input
                id="ops-date"
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="input-field min-h-11 flex-1 text-center font-medium"
              />
              <button
                type="button"
                onClick={onNextDay}
                className="btn-secondary shrink-0 p-2.5"
                aria-label="Next day"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="ops-volume" className="input-label">
              Scheduled volume
            </label>
            <input
              id="ops-volume"
              type="number"
              min={0}
              inputMode="numeric"
              value={dailyCount}
              onChange={(e) => onCountChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onQuickSave();
                }
              }}
              placeholder="Enter count"
              className={cn(
                'w-full rounded-xl border-2 bg-slate-950 px-4 py-4 text-center text-4xl font-bold tabular-nums text-white',
                'border-brand-primary/30 focus:border-brand-primary focus:outline-none focus:ring-4 focus:ring-brand-primary/15',
                'placeholder:text-slate-600'
              )}
            />
            {vsGoal !== null && (
              <p
                className={cn(
                  'mt-2 text-center text-sm font-medium',
                  vsGoal < 0 ? 'text-rose-400' : vsGoal === 0 ? 'text-amber-400' : 'text-emerald-400'
                )}
              >
                {vsGoal === 0
                  ? 'Exactly on goal'
                  : vsGoal > 0
                    ? `${vsGoal} above goal`
                    : `${Math.abs(vsGoal)} below goal`}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:min-w-[220px]">
          <button
            type="button"
            onClick={onQuickSave}
            disabled={saving || !hasValue}
            className="btn-primary h-12 w-full text-base font-semibold"
          >
            {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={18} />}
            Save count
          </button>
          <button
            type="button"
            onClick={onOpenBreakdown}
            disabled={saving}
            className="btn-secondary h-11 w-full"
          >
            <PieChart size={16} />
            Edit breakdown
          </button>
          <button
            type="button"
            onClick={onPdfClick}
            disabled={isUploadingPdf}
            className="btn-secondary h-11 w-full text-emerald-400"
          >
            {isUploadingPdf ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}
            Import schedule PDF
          </button>
          <p className="text-center text-xs text-slate-500">
            Press Enter or Save to record. Breakdown is optional.
          </p>
        </div>
      </div>
    </div>
  );
}
