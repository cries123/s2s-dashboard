import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../../../types';
import {
  buildScheduleTechColumns,
  categoryScheduleColor,
  formatScheduleTime,
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

function appointmentsForColumn(appointments: ScheduledAppointmentSlot[], columnId: string) {
  return appointments
    .filter((appt) => (appt.techNumber || '').trim() === columnId)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.customerName.localeCompare(b.customerName));
}

function AppointmentDetail({ appt, onBack }: { appt: ScheduledAppointmentSlot; onBack: () => void }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Time', value: formatScheduleTime(appt.startMinutes) },
    { label: 'Duration', value: formatDuration(appt.durationMinutes) },
    { label: 'Customer', value: appt.customerName },
    { label: 'Vehicle', value: appt.vehicleLabel },
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
          <p className="text-lg font-bold mt-1">{appt.customerName}</p>
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

function AppointmentListRow({
  appt,
  onSelect,
}: {
  appt: ScheduledAppointmentSlot;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-lg border px-3 py-2.5 transition-colors hover:brightness-110',
        categoryScheduleColor(appt.category)
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{appt.customerName}</p>
          <p className="text-xs opacity-80 truncate mt-0.5">{appt.vehicleLabel}</p>
          {appt.concern ? (
            <p className="text-[11px] opacity-65 truncate mt-1">{appt.concern}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold tabular-nums">{formatScheduleTime(appt.startMinutes)}</p>
          {appt.isWaiter ? (
            <p className="text-[10px] uppercase tracking-wider opacity-70 mt-0.5">Waiter</p>
          ) : null}
        </div>
      </div>
    </button>
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

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-200">{formatDisplayDate(date)}</p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
          {appointments.length} appointments
        </p>
      </div>

      <div className="space-y-4">
        {columns.map((column) => {
          const columnAppointments = appointmentsForColumn(appointments, column.id);
          if (columnAppointments.length === 0) return null;

          return (
            <section
              key={column.id || 'open'}
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: 'var(--color-surface-border)' }}
            >
              <div
                className="px-4 py-2.5 border-b bg-slate-950/50 flex items-center justify-between gap-2"
                style={{ borderColor: 'var(--color-surface-border)' }}
              >
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                  {column.id ? `Tech ${column.label}` : column.label}
                </h4>
                <span className="text-[10px] text-slate-500 font-semibold tabular-nums">
                  {columnAppointments.length} appt{columnAppointments.length === 1 ? '' : 's'}
                </span>
              </div>

              <ul className="p-3 space-y-2">
                {columnAppointments.map((appt) => (
                  <li key={`${appt.id}-${appt.startMinutes}`}>
                    <AppointmentListRow appt={appt} onSelect={() => setSelectedAppt(appt)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
