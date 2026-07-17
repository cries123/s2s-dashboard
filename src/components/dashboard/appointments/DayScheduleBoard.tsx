import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../../../types';
import {
  buildScheduleTechColumns,
  categoryScheduleCardClass,
  categoryScheduleLegendClass,
  formatScheduleTimeDetail,
  layoutColumnAppointments,
  minutesToSchedulePx,
  resolveScheduleGridBounds,
  scheduleHourLabelsForRange,
  scheduleLunchBand,
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

function displayCustomerName(appt: ScheduledAppointmentSlot): string {
  const name = (appt.customerName || '').trim();
  if (!name || name.toUpperCase() === 'CUSTOMER') {
    return appt.appointmentNumber ? `APPT #${appt.appointmentNumber}` : 'UNMATCHED CUSTOMER';
  }
  return name.toUpperCase();
}

function displayVehicleLabel(appt: ScheduledAppointmentSlot): string {
  const label = (appt.vehicleLabel || '').trim();
  return label.toUpperCase() === 'VEHICLE' ? '' : label;
}

function displayConcern(appt: ScheduledAppointmentSlot): string {
  const concern = (appt.concern || '').trim();
  const vehicle = displayVehicleLabel(appt);
  if (concern && vehicle) {
    const shortConcern =
      concern.length > 42 ? `${concern.slice(0, 42).trim()}…` : concern;
    return `${vehicle} · ${shortConcern}`;
  }
  return concern || vehicle || '';
}

function AppointmentDetail({ appt, onBack }: { appt: ScheduledAppointmentSlot; onBack: () => void }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Time', value: formatScheduleTimeDetail(appt.startMinutes) },
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
        Back to schedule
      </button>

      <div
        className={cn(
          'rounded-lg border p-4 space-y-4',
          categoryScheduleCardClass(appt.category)
        )}
      >
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">Appointment</p>
          <p className="text-lg font-black mt-1 tracking-tight">{displayCustomerName(appt)}</p>
          <p className="text-sm opacity-95 mt-0.5 font-semibold">
            {formatScheduleTimeDetail(appt.startMinutes)}
            {appt.isWaiter ? ' · Waiter' : ''}
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wider font-bold opacity-70">{row.label}</dt>
              <dd className="text-sm mt-0.5 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

const LEGEND = [
  { key: 'oilChange' as const, label: 'Oil' },
  { key: 'diagnosis' as const, label: 'Diag' },
  { key: 'recall' as const, label: 'Recall' },
];

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
      <div
        className={cn('rounded-lg border p-8 text-center bg-[#0b1018]', className)}
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <p className="crm-label">Loading day schedule…</p>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div
        className={cn('rounded-lg border p-8 text-center space-y-3 bg-[#0b1018]', className)}
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
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
        <p className="text-sm font-semibold text-slate-200">{formatDisplayDate(date)}</p>
        <AppointmentDetail appt={selectedAppt} onBack={() => setSelectedAppt(null)} />
      </div>
    );
  }

  const bounds = resolveScheduleGridBounds(appointments);
  const hourLabels = scheduleHourLabelsForRange(bounds.startMinutes, bounds.endMinutes);
  const lunchBand = scheduleLunchBand(bounds.startMinutes);
  const halfHourTicks: number[] = [];
  for (let m = bounds.startMinutes + 30; m < bounds.endMinutes; m += 60) {
    halfHourTicks.push(m);
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-sm font-bold text-white tracking-tight">{formatDisplayDate(date)}</p>
        <div className="flex flex-wrap items-center gap-4">
          {LEGEND.map((item) => (
            <span key={item.key} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              <span className={cn('w-2.5 h-2.5 rounded-full', categoryScheduleLegendClass(item.key))} />
              {item.label}
            </span>
          ))}
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            {appointments.length} appts
          </span>
        </div>
      </div>

      <div
        className="rounded-lg border overflow-hidden bg-[#0b1018] shadow-inner"
        style={{ borderColor: '#1e293b' }}
      >
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Column headers — PBS style */}
            <div
              className="flex border-b bg-[#0d1320]"
              style={{ borderColor: '#1e293b' }}
            >
              <div className="w-[52px] shrink-0 border-r" style={{ borderColor: '#1e293b' }} />
              {columns.map((column) => (
                <div
                  key={column.id || 'open'}
                  className="flex-1 min-w-[132px] px-2 py-2 border-r last:border-r-0 text-center"
                  style={{ borderColor: '#1e293b' }}
                >
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-100 truncate">
                    {column.id ? `Tech ${column.label}` : column.label}
                    <span className="text-slate-500 font-bold"> ({column.count})</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="flex relative">
              {/* Time axis */}
              <div
                className="w-[52px] shrink-0 border-r relative bg-[#0b1018]"
                style={{ borderColor: '#1e293b', height: bounds.heightPx }}
              >
                {hourLabels.map((hour) => (
                  <span
                    key={hour.minutes}
                    className="absolute right-1.5 -translate-y-1/2 text-[10px] font-bold text-slate-500 tabular-nums leading-none"
                    style={{ top: minutesToSchedulePx(hour.minutes, bounds.startMinutes) }}
                  >
                    {hour.label}
                  </span>
                ))}
              </div>

              {/* Tech columns */}
              <div className="flex flex-1 relative">
                {columns.map((column) => {
                  const positioned = layoutColumnAppointments(
                    appointments,
                    column.id,
                    bounds.startMinutes
                  );

                  return (
                    <div
                      key={column.id || 'open'}
                      className="flex-1 min-w-[132px] relative border-r last:border-r-0 bg-[#0b1018]"
                      style={{ borderColor: '#1e293b', height: bounds.heightPx }}
                    >
                      {hourLabels.map((hour) => (
                        <div
                          key={hour.minutes}
                          className="absolute left-0 right-0 border-t pointer-events-none"
                          style={{
                            borderColor: 'rgba(148, 163, 184, 0.12)',
                            top: minutesToSchedulePx(hour.minutes, bounds.startMinutes),
                          }}
                        />
                      ))}
                      {halfHourTicks.map((minutes) => (
                        <div
                          key={minutes}
                          className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
                          style={{
                            borderColor: 'rgba(148, 163, 184, 0.06)',
                            top: minutesToSchedulePx(minutes, bounds.startMinutes),
                          }}
                        />
                      ))}

                      {positioned.map((appt) => {
                        const laneWidth = 100 / appt.laneCount;
                        const detail = displayConcern(appt);
                        return (
                          <button
                            key={`${appt.id}-${appt.startMinutes}`}
                            type="button"
                            onClick={() => setSelectedAppt(appt)}
                            className={cn(
                              'absolute rounded-[3px] border px-1 py-0.5 text-left overflow-hidden transition-[filter,transform] hover:brightness-110 hover:z-20 hover:scale-[1.01]',
                              categoryScheduleCardClass(appt.category)
                            )}
                            style={{
                              top: appt.top,
                              height: appt.height,
                              left: `calc(${appt.lane * laneWidth}% + 2px)`,
                              width: `calc(${laneWidth}% - 4px)`,
                            }}
                            title={`${formatScheduleTimeDetail(appt.startMinutes)} · ${displayCustomerName(appt)}`}
                          >
                            <p className="text-[10px] font-black leading-tight truncate">
                              {formatScheduleTimeDetail(appt.startMinutes)}
                              {appt.isWaiter ? ' (W)' : ''}
                            </p>
                            <p className="text-[10px] font-black leading-tight truncate tracking-tight">
                              {displayCustomerName(appt)}
                            </p>
                            {appt.height >= 44 && detail ? (
                              <p className="text-[9px] leading-tight opacity-90 truncate mt-0.5 font-medium">
                                {detail}
                              </p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Shop lunch — 12 PM to 1 PM across all columns */}
                {lunchBand && lunchBand.height > 0 ? (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none flex items-center justify-center border-y border-amber-900/30"
                    style={{
                      top: lunchBand.top,
                      height: lunchBand.height,
                      background:
                        'repeating-linear-gradient(-45deg, rgba(15,23,42,0.92) 0, rgba(15,23,42,0.92) 8px, rgba(30,41,59,0.75) 8px, rgba(30,41,59,0.75) 16px)',
                    }}
                  >
                    <span className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-500/70 bg-[#0b1018]/80 px-3 py-1 rounded border border-amber-900/30">
                      Lunch
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-600 px-1">
        Shop lunch blocked 12:00 PM – 1:00 PM · Tap an appointment for full details
      </p>
    </div>
  );
}
