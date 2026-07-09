import React from 'react';
import { cn } from '../../../lib/utils';
import type { PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../../../types';
import {
  SCHEDULE_PIXELS_PER_HOUR,
  buildScheduleTechColumns,
  categoryScheduleColor,
  formatScheduleTime,
  layoutColumnAppointments,
  resolveScheduleGridBounds,
  scheduleHourLabelsForRange,
} from '../../../lib/appointmentSchedule';

interface DayScheduleBoardProps {
  date: string;
  appointments: ScheduledAppointmentSlot[];
  techRoster?: PerformanceAdvisorSlot[];
  expectedCount?: number;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
}

function formatDisplayDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function ScheduleAppointmentCard({
  appt,
  top,
  height,
  lane,
  laneCount,
}: {
  appt: ScheduledAppointmentSlot;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
}) {
  const laneWidthPct = 100 / laneCount;
  const leftPct = lane * laneWidthPct;
  const compact = height < 48;

  return (
    <div
      className={cn(
        'absolute rounded border px-1.5 py-1 overflow-hidden shadow-sm',
        categoryScheduleColor(appt.category)
      )}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${laneWidthPct}% - 4px)`,
      }}
      title={[appt.customerName, formatScheduleTime(appt.startMinutes), appt.concern]
        .filter(Boolean)
        .join(' · ')}
    >
      <p className="text-[10px] font-bold leading-snug truncate">{appt.customerName}</p>
      <p className="text-[9px] opacity-85 truncate tabular-nums">
        {formatScheduleTime(appt.startMinutes)}
        {appt.isWaiter ? ' · Waiter' : ''}
      </p>
      {!compact ? (
        <>
          <p className="text-[9px] opacity-75 truncate leading-snug">{appt.vehicleLabel}</p>
          {height >= 56 && appt.advisor ? (
            <p className="text-[9px] opacity-70 truncate leading-snug mt-0.5">Adv: {appt.advisor}</p>
          ) : null}
          {height >= 72 && appt.pickupTimeLabel ? (
            <p className="text-[9px] opacity-70 truncate leading-snug">Pickup {appt.pickupTimeLabel}</p>
          ) : null}
          {height >= 88 && appt.concern ? (
            <p className="text-[8px] opacity-60 line-clamp-2 leading-snug mt-0.5">{appt.concern}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function DayScheduleBoard({
  date,
  appointments,
  techRoster = [],
  expectedCount = 0,
  loading = false,
  error = null,
  onRefresh,
  className,
}: DayScheduleBoardProps) {
  const columns = React.useMemo(
    () => buildScheduleTechColumns(appointments, techRoster),
    [appointments, techRoster]
  );
  const gridBounds = React.useMemo(() => resolveScheduleGridBounds(appointments), [appointments]);
  const hourLabels = React.useMemo(
    () => scheduleHourLabelsForRange(gridBounds.startMinutes, gridBounds.endMinutes),
    [gridBounds.startMinutes, gridBounds.endMinutes]
  );

  if (loading) {
    return (
      <div className={cn('rounded-lg border p-8 text-center', className)} style={{ borderColor: 'var(--color-surface-border)' }}>
        <p className="crm-label">Loading day schedule…</p>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className={cn('rounded-lg border p-8 text-center space-y-3', className)} style={{ borderColor: 'var(--color-surface-border)' }}>
        <p className="crm-label">No scheduled appointments stored for this day.</p>
        {expectedCount > 0 ? (
          <p className="text-xs text-amber-400/90">
            Operations shows <strong>{expectedCount}</strong> appointments for this date — loading detail from PBS…
          </p>
        ) : null}
        {error ? <p className="text-xs text-rose-400/90">{error}</p> : null}
        <p className="text-xs text-slate-500">
          {onRefresh
            ? 'If this persists, try refreshing from PBS below or run Pull changes in Admin → PBS Sync.'
            : 'Run Pull changes in Admin → PBS Sync to load the day schedule.'}
        </p>
        {onRefresh ? (
          <button type="button" onClick={onRefresh} className="btn-secondary text-xs px-4 py-2">
            Refresh from PBS
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-200">{formatDisplayDate(date)}</p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
          {appointments.length} appointments · {formatScheduleTime(gridBounds.startMinutes)}–
          {formatScheduleTime(gridBounds.endMinutes)}
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
        <div className="flex overflow-x-auto overscroll-x-contain">
          <div
            className="shrink-0 w-14 border-r bg-slate-950/60 sticky left-0 z-10"
            style={{ borderColor: 'var(--color-surface-border)' }}
          >
            <div className="h-11 border-b" style={{ borderColor: 'var(--color-surface-border)' }} />
            <div className="relative" style={{ height: gridBounds.heightPx }}>
              {hourLabels.map((hour) => (
                <div
                  key={hour.minutes}
                  className="absolute left-0 right-0 pr-1.5 text-[10px] text-slate-500 text-right tabular-nums -translate-y-2"
                  style={{
                    top:
                      ((hour.minutes - gridBounds.startMinutes) / 60) * SCHEDULE_PIXELS_PER_HOUR,
                  }}
                >
                  {hour.label}
                </div>
              ))}
            </div>
          </div>

          <div
            className="grid flex-1"
            style={{
              gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(11rem, 1fr))`,
              minWidth: `${Math.max(columns.length, 1) * 11}rem`,
            }}
          >
            {columns.map((column) => {
              const positioned = layoutColumnAppointments(
                appointments,
                column.id,
                gridBounds.startMinutes
              );

              return (
                <div
                  key={column.id || 'unassigned'}
                  className="border-r last:border-r-0 bg-slate-950/20 min-w-[11rem]"
                  style={{ borderColor: 'var(--color-surface-border)' }}
                >
                  <div
                    className="h-11 px-2 flex items-center justify-between gap-1 border-b text-[10px] font-semibold uppercase tracking-wide text-slate-300"
                    style={{ borderColor: 'var(--color-surface-border)' }}
                  >
                    <span className="whitespace-nowrap overflow-hidden text-ellipsis" title={column.label}>
                      {column.label}
                    </span>
                    <span className="text-slate-500 shrink-0 tabular-nums">({column.count})</span>
                  </div>

                  <div className="relative" style={{ height: gridBounds.heightPx }}>
                    {hourLabels.map((hour) => (
                      <div
                        key={`${column.id}-${hour.minutes}`}
                        className="absolute left-0 right-0 border-t border-white/5 pointer-events-none"
                        style={{
                          top:
                            ((hour.minutes - gridBounds.startMinutes) / 60) *
                            SCHEDULE_PIXELS_PER_HOUR,
                        }}
                      />
                    ))}

                    {positioned.map((appt) => (
                      <ScheduleAppointmentCard
                        key={`${appt.id}-${appt.startMinutes}-${appt.lane}`}
                        appt={appt}
                        top={appt.top}
                        height={appt.height}
                        lane={appt.lane}
                        laneCount={appt.laneCount}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
