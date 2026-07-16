import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../../../types';
import {
  buildScheduleTechColumns,
  categoryScheduleColor,
  formatScheduleTime,
  layoutColumnAppointments,
  resolveScheduleGridBounds,
  scheduleHourLabelsForRange,
  SCHEDULE_PIXELS_PER_HOUR,
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

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function categoryLabel(category: ScheduledAppointmentSlot['category']): string {
  switch (category) {
    case 'oilChange':
      return 'Oil change';
    case 'recall':
      return 'Recall';
    case 'diagnosis':
      return 'Diagnosis';
    default:
      return 'General';
  }
}

/** Legacy synced slots stored placeholder text — swap for something useful. */
function displayCustomerName(appt: ScheduledAppointmentSlot): string {
  const name = (appt.customerName || '').trim();
  if (!name || name.toUpperCase() === 'CUSTOMER') {
    return appt.appointmentNumber ? `Appt #${appt.appointmentNumber}` : 'Unmatched customer';
  }
  return name;
}

function displayVehicleLabel(appt: ScheduledAppointmentSlot): string {
  const label = (appt.vehicleLabel || '').trim();
  return label.toUpperCase() === 'VEHICLE' ? '' : label;
}

function AppointmentDetail({ appt, onBack }: { appt: ScheduledAppointmentSlot; onBack: () => void }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Time', value: formatScheduleTime(appt.startMinutes) },
    { label: 'Duration', value: formatDuration(appt.durationMinutes) },
    { label: 'Customer', value: displayCustomerName(appt) },
    { label: 'Vehicle', value: displayVehicleLabel(appt) || '—' },
    { label: 'Advisor', value: appt.advisor || '—' },
    { label: 'Technician', value: appt.techNumber || 'Open / unassigned' },
    { label: 'Appt #', value: appt.appointmentNumber || '—' },
    { label: 'Status', value: appt.status || '—' },
    { label: 'Category', value: categoryLabel(appt.category) },
    { label: 'Waiter', value: appt.isWaiter ? 'Yes' : 'No' },
    { label: 'Pickup', value: appt.pickupTimeLabel || '—' },
    { label: 'Concern', value: appt.concern || '—' },
  ];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-white transition-colors"
      >
        <ChevronLeft size={14} />
        Back to list
      </button>

      <div
        className={cn(
          'rounded-xl border p-4 space-y-4',
          categoryScheduleColor(appt.category)
        )}
      >
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold opacity-70">Appointment</p>
          <p className="text-lg font-bold mt-1">{displayCustomerName(appt)}</p>
          <p className="text-sm opacity-90 mt-0.5">
            {formatScheduleTime(appt.startMinutes)}
            {appt.isWaiter ? ' · Waiter' : ''}
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wider font-bold opacity-60">{row.label}</dt>
              <dd className="text-sm mt-0.5 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
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
  const [selectedAppt, setSelectedAppt] = React.useState<ScheduledAppointmentSlot | null>(null);

  React.useEffect(() => {
    setSelectedAppt(null);
  }, [date, appointments]);

  const columns = React.useMemo(
    () => buildScheduleTechColumns(appointments, techRoster),
    [appointments, techRoster]
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

  if (selectedAppt) {
    return (
      <div className={cn('space-y-3', className)}>
        <p className="text-sm font-medium text-slate-200">{formatDisplayDate(date)}</p>
        <AppointmentDetail appt={selectedAppt} onBack={() => setSelectedAppt(null)} />
      </div>
    );
  }

  const bounds = resolveScheduleGridBounds(appointments);
  const hourLabels = scheduleHourLabelsForRange(bounds.startMinutes, bounds.endMinutes);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-200">{formatDisplayDate(date)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /> Oil
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/60" /> Diag
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/60" /> Recall
          </span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            {appointments.length} appointments
          </span>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-x-auto"
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <div className="min-w-fit">
          {/* Column headers */}
          <div className="flex sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="w-16 shrink-0 sticky left-0 z-10 bg-slate-950/95 border-r" style={{ borderColor: 'var(--color-surface-border)' }} />
            {columns.map((column) => (
              <div
                key={column.id || 'open'}
                className="flex-1 min-w-[160px] px-3 py-2.5 border-r last:border-r-0 text-center"
                style={{ borderColor: 'var(--color-surface-border)' }}
              >
                <p className="text-xs font-black uppercase tracking-wider text-slate-200 truncate">
                  {column.id ? `Tech ${column.label}` : column.label}
                </p>
                <p className="text-[10px] text-slate-500 tabular-nums">
                  {column.count} appt{column.count === 1 ? '' : 's'}
                </p>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="flex">
            {/* Time axis */}
            <div
              className="w-16 shrink-0 sticky left-0 z-10 bg-slate-950/95 border-r relative"
              style={{ borderColor: 'var(--color-surface-border)', height: bounds.heightPx }}
            >
              {hourLabels.map((hour) => (
                <span
                  key={hour.minutes}
                  className="absolute right-2 -translate-y-1/2 text-[10px] font-semibold text-slate-500 tabular-nums"
                  style={{
                    top: ((hour.minutes - bounds.startMinutes) / 60) * SCHEDULE_PIXELS_PER_HOUR,
                  }}
                >
                  {hour.label}
                </span>
              ))}
            </div>

            {columns.map((column) => {
              const positioned = layoutColumnAppointments(
                appointments,
                column.id,
                bounds.startMinutes
              );

              return (
                <div
                  key={column.id || 'open'}
                  className="flex-1 min-w-[160px] relative border-r last:border-r-0"
                  style={{ borderColor: 'var(--color-surface-border)', height: bounds.heightPx }}
                >
                  {/* Hour gridlines show open availability */}
                  {hourLabels.map((hour) => (
                    <div
                      key={hour.minutes}
                      className="absolute left-0 right-0 border-t border-white/[0.04] pointer-events-none"
                      style={{
                        top: ((hour.minutes - bounds.startMinutes) / 60) * SCHEDULE_PIXELS_PER_HOUR,
                      }}
                    />
                  ))}

                  {positioned.map((appt) => {
                    const laneWidth = 100 / appt.laneCount;
                    return (
                      <button
                        key={`${appt.id}-${appt.startMinutes}`}
                        type="button"
                        onClick={() => setSelectedAppt(appt)}
                        className={cn(
                          'absolute rounded-md border px-1.5 py-1 text-left overflow-hidden transition-all hover:brightness-125 hover:z-10',
                          categoryScheduleColor(appt.category)
                        )}
                        style={{
                          top: appt.top,
                          height: appt.height,
                          left: `calc(${appt.lane * laneWidth}% + 3px)`,
                          width: `calc(${laneWidth}% - 6px)`,
                        }}
                        title={`${formatScheduleTime(appt.startMinutes)} · ${displayCustomerName(appt)}`}
                      >
                        <p className="text-[10px] font-bold leading-tight truncate">
                          {formatScheduleTime(appt.startMinutes)}
                          {appt.isWaiter ? ' · W' : ''}
                        </p>
                        <p className="text-[11px] font-semibold leading-tight truncate">
                          {displayCustomerName(appt)}
                        </p>
                        {appt.height >= 52 && (
                          <p className="text-[10px] opacity-75 leading-tight truncate">
                            {displayVehicleLabel(appt) || appt.concern}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
