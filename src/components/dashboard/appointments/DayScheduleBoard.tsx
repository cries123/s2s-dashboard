import React from 'react';
import { cn } from '../../../lib/utils';
import type { PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../../../types';
import {
  SCHEDULE_GRID_END_MINUTES,
  SCHEDULE_GRID_START_MINUTES,
  SCHEDULE_PIXELS_PER_HOUR,
  buildScheduleTechColumns,
  categoryScheduleColor,
  formatScheduleTime,
  scheduleHourLabels,
} from '../../../lib/appointmentSchedule';

interface DayScheduleBoardProps {
  date: string;
  appointments: ScheduledAppointmentSlot[];
  techRoster?: PerformanceAdvisorSlot[];
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

export function DayScheduleBoard({
  date,
  appointments,
  techRoster = [],
  className,
}: DayScheduleBoardProps) {
  const columns = React.useMemo(
    () => buildScheduleTechColumns(appointments, techRoster),
    [appointments, techRoster]
  );
  const hourLabels = React.useMemo(() => scheduleHourLabels(), []);
  const gridHeight =
    ((SCHEDULE_GRID_END_MINUTES - SCHEDULE_GRID_START_MINUTES) / 60) * SCHEDULE_PIXELS_PER_HOUR;

  const appointmentsForColumn = (columnId: string) =>
    appointments.filter((appt) => (appt.techNumber || '').trim() === columnId);

  if (appointments.length === 0) {
    return (
      <div className={cn('rounded-lg border p-8 text-center', className)} style={{ borderColor: 'var(--color-surface-border)' }}>
        <p className="crm-label">No scheduled appointments stored for this day.</p>
        <p className="text-xs text-slate-500 mt-2">Run Pull changes in Admin → PBS Sync to load the day schedule.</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-sm font-medium text-slate-200">{formatDisplayDate(date)}</p>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
        <div className="flex overflow-x-auto">
          <div className="shrink-0 w-12 border-r bg-slate-950/60" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="h-10 border-b" style={{ borderColor: 'var(--color-surface-border)' }} />
            <div className="relative" style={{ height: gridHeight }}>
              {hourLabels.map((hour) => (
                <div
                  key={hour.minutes}
                  className="absolute left-0 right-0 pr-1 text-[10px] text-slate-500 text-right tabular-nums -translate-y-2"
                  style={{
                    top: ((hour.minutes - SCHEDULE_GRID_START_MINUTES) / 60) * SCHEDULE_PIXELS_PER_HOUR,
                  }}
                >
                  {hour.label}
                </div>
              ))}
            </div>
          </div>

          <div
            className="grid flex-1 min-w-[640px]"
            style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(150px, 1fr))` }}
          >
            {columns.map((column) => (
              <div
                key={column.id || 'unassigned'}
                className="border-r last:border-r-0 bg-slate-950/20"
                style={{ borderColor: 'var(--color-surface-border)' }}
              >
                <div
                  className="h-10 px-2 flex items-center justify-between border-b text-[10px] font-semibold uppercase tracking-wide text-slate-300"
                  style={{ borderColor: 'var(--color-surface-border)' }}
                >
                  <span className="truncate">{column.label}</span>
                  <span className="text-slate-500 shrink-0">({column.count})</span>
                </div>

                <div className="relative" style={{ height: gridHeight }}>
                  {hourLabels.map((hour) => (
                    <div
                      key={`${column.id}-${hour.minutes}`}
                      className="absolute left-0 right-0 border-t border-white/5"
                      style={{
                        top: ((hour.minutes - SCHEDULE_GRID_START_MINUTES) / 60) * SCHEDULE_PIXELS_PER_HOUR,
                      }}
                    />
                  ))}

                  {appointmentsForColumn(column.id).map((appt) => {
                    const top =
                      ((appt.startMinutes - SCHEDULE_GRID_START_MINUTES) / 60) * SCHEDULE_PIXELS_PER_HOUR;
                    const height = Math.max(
                      28,
                      (appt.durationMinutes / 60) * SCHEDULE_PIXELS_PER_HOUR - 2
                    );

                    return (
                      <div
                        key={appt.id}
                        className={cn(
                          'absolute left-1 right-1 rounded border px-1.5 py-1 overflow-hidden shadow-sm',
                          categoryScheduleColor(appt.category)
                        )}
                        style={{ top: Math.max(0, top), height }}
                        title={appt.concern}
                      >
                        <p className="text-[10px] font-bold leading-tight truncate">{appt.customerName}</p>
                        <p className="text-[9px] opacity-80 truncate">
                          {formatScheduleTime(appt.startMinutes)}
                          {appt.isWaiter ? ' · WAITER' : ''}
                        </p>
                        <p className="text-[9px] opacity-70 truncate">{appt.vehicleLabel}</p>
                        {height >= 44 && (
                          <p className="text-[9px] opacity-70 truncate mt-0.5">
                            {appt.advisor ? `Adv: ${appt.advisor}` : ''}
                            {appt.pickupTimeLabel ? ` · Pickup ${appt.pickupTimeLabel}` : ''}
                          </p>
                        )}
                        {height >= 60 && appt.concern && (
                          <p className="text-[8px] opacity-60 line-clamp-2 mt-0.5">{appt.concern}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
