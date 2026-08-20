import React from 'react';
import { ChevronLeft, Maximize2, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../../../types';
import {
  buildScheduleTechColumns,
  CAPACITY_STATUS_STYLES,
  categoryScheduleCardClass,
  categoryScheduleLegendClass,
  computeScheduleCapacity,
  formatScheduleDurationLabel,
  formatScheduleTimeDetail,
  layoutColumnAppointments,
  minutesToSchedulePx,
  resolveScheduleGridBounds,
  scheduleHourLabelsForRange,
  scheduleLunchBand,
  SCHEDULE_HOURS_PER_TECH_PER_DAY,
  SCHEDULE_LUNCH_START_MINUTES,
  type ScheduleCapacitySummary,
  type ScheduleTechColumn,
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
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-slate-900 dark:hover:text-white transition-colors"
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

const MOBILE_ALL_TECH = '__all__';

function TechPickerRow({
  columns,
  totalCount,
  value,
  onChange,
}: {
  columns: ScheduleTechColumn[];
  totalCount: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      <button
        type="button"
        onClick={() => onChange(MOBILE_ALL_TECH)}
        className={cn(
          'shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors',
          value === MOBILE_ALL_TECH
            ? 'bg-brand-primary border-brand-primary text-white'
            : 'border-transparent bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
        )}
      >
        All · {totalCount}
      </button>
      {columns.map((column) => (
        <button
          key={column.id || 'open'}
          type="button"
          onClick={() => onChange(column.id)}
          className={cn(
            'shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors',
            value === column.id
              ? 'bg-brand-primary border-brand-primary text-white'
              : 'border-transparent bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
          )}
        >
          {column.id ? `Tech ${column.label}` : column.label} · {column.count}
        </button>
      ))}
    </div>
  );
}

function AgendaList({
  appointments,
  onSelect,
}: {
  appointments: ScheduledAppointmentSlot[];
  onSelect: (appt: ScheduledAppointmentSlot) => void;
}) {
  if (appointments.length === 0) {
    return (
      <p className="text-xs text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
        No appointments for this technician today.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {appointments.map((appt, idx) => {
        const prevAppt = appointments[idx - 1];
        const crossesLunch =
          Boolean(prevAppt) &&
          prevAppt!.startMinutes < SCHEDULE_LUNCH_START_MINUTES &&
          appt.startMinutes >= SCHEDULE_LUNCH_START_MINUTES;
        const detail = displayConcern(appt);

        return (
          <React.Fragment key={`${appt.id}-${appt.startMinutes}`}>
            {crossesLunch ? (
              <div className="flex items-center gap-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-500/80">
                <span className="flex-1 h-px bg-amber-500/20" />
                Shop lunch · 12–1 PM
                <span className="flex-1 h-px bg-amber-500/20" />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(appt)}
              className="w-full flex gap-2.5 text-left rounded-lg border p-3 bg-slate-50 dark:bg-[#0b1018] hover:border-brand-primary/30 transition-colors"
              style={{ borderColor: 'var(--color-surface-border)' }}
            >
              <span className={cn('w-1 rounded-full shrink-0', categoryScheduleLegendClass(appt.category))} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-black">
                    {formatScheduleTimeDetail(appt.startMinutes)}
                    {appt.isWaiter ? ' (W)' : ''}
                  </span>
                  <span className="text-[10px] font-semibold shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatDuration(appt.durationMinutes)}
                  </span>
                </div>
                <p className="text-xs font-bold mt-0.5 truncate">{displayCustomerName(appt)}</p>
                {detail ? (
                  <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {detail}
                  </p>
                ) : null}
                <span className="inline-block mt-1.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500 dark:text-slate-400">
                  {appt.techNumber ? `Tech ${appt.techNumber}` : 'Unassigned'}
                </span>
              </div>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface DayScheduleFullscreenViewProps {
  date: string;
  appointments: ScheduledAppointmentSlot[];
  columns: ScheduleTechColumn[];
  capacity: ScheduleCapacitySummary;
  onClose: () => void;
}

/** Mobile "pop out" full-day view — mirrors the Dispatch board's fullscreen display pattern. */
function DayScheduleFullscreenView({
  date,
  appointments,
  columns,
  capacity,
  onClose,
}: DayScheduleFullscreenViewProps) {
  const [fsTech, setFsTech] = React.useState<string>(MOBILE_ALL_TECH);
  const [fsSelectedAppt, setFsSelectedAppt] = React.useState<ScheduledAppointmentSlot | null>(null);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const filteredAppointments = React.useMemo(
    () =>
      fsTech === MOBILE_ALL_TECH
        ? appointments
        : appointments.filter((appt) => (appt.techNumber || '').trim() === fsTech),
    [appointments, fsTech]
  );

  const statusStyle = CAPACITY_STATUS_STYLES[capacity.status];

  return (
    <div
      className="fixed inset-0 z-[9999] bg-white dark:bg-[#0b1018] text-slate-900 dark:text-slate-100 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Full day schedule"
    >
      <div
        className="shrink-0 flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b"
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-primary">
            Full day schedule
          </p>
          <h2 className="text-base font-black tracking-tight truncate">{formatDisplayDate(date)}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          style={{ borderColor: 'var(--color-surface-border)' }}
          title="Close full screen (Esc)"
        >
          <X size={12} />
          Close
        </button>
      </div>

      <div
        className="shrink-0 px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-2xl font-black tracking-tight">{capacity.utilizationPercent}%</p>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full whitespace-nowrap',
                statusStyle.chip
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
              {statusStyle.label}
            </span>
          </div>
          <span className="text-[10px] font-semibold shrink-0 text-right" style={{ color: 'var(--color-text-secondary)' }}>
            {capacity.techCount} tech{capacity.techCount === 1 ? '' : 's'} × {SCHEDULE_HOURS_PER_TECH_PER_DAY}h
          </span>
        </div>
        <div className={cn('relative h-2 rounded-full mt-2 overflow-hidden', statusStyle.track)}>
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full transition-all', statusStyle.fill)}
            style={{ width: `${Math.min(100, capacity.utilizationPercent)}%` }}
          />
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>
            {formatScheduleDurationLabel(capacity.scheduledMinutes)}
          </strong>{' '}
          scheduled of{' '}
          <strong style={{ color: 'var(--color-text-primary)' }}>
            {formatScheduleDurationLabel(capacity.capacityMinutes)}
          </strong>{' '}
          available
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {fsSelectedAppt ? (
          <AppointmentDetail appt={fsSelectedAppt} onBack={() => setFsSelectedAppt(null)} />
        ) : (
          <>
            <TechPickerRow
              columns={columns}
              totalCount={appointments.length}
              value={fsTech}
              onChange={setFsTech}
            />
            <AgendaList appointments={filteredAppointments} onSelect={setFsSelectedAppt} />
          </>
        )}
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
  const [mobileTech, setMobileTech] = React.useState<string>(MOBILE_ALL_TECH);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    setSelectedAppt(null);
    setMobileTech(MOBILE_ALL_TECH);
    setIsFullscreen(false);
  }, [date, appointments]);

  const openFullscreen = async () => {
    setIsFullscreen(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen is optional; fixed overlay still works in-window.
    }
  };

  const closeFullscreen = () => {
    setIsFullscreen(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  };

  const columns = React.useMemo(
    () => buildScheduleTechColumns(appointments, techRoster),
    [appointments, techRoster]
  );

  const capacity = React.useMemo(
    () => computeScheduleCapacity(appointments, techRoster),
    [appointments, techRoster]
  );

  const sortedAppointments = React.useMemo(
    () =>
      [...appointments].sort(
        (a, b) => a.startMinutes - b.startMinutes || a.appointmentNumber.localeCompare(b.appointmentNumber)
      ),
    [appointments]
  );

  const mobileAppointments = React.useMemo(
    () =>
      mobileTech === MOBILE_ALL_TECH
        ? sortedAppointments
        : sortedAppointments.filter((appt) => (appt.techNumber || '').trim() === mobileTech),
    [sortedAppointments, mobileTech]
  );

  if (loading) {
    return (
      <div
        className={cn('rounded-lg border p-8 text-center bg-slate-50 dark:bg-[#0b1018]', className)}
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <p className="crm-label">Loading day schedule…</p>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div
        className={cn('rounded-lg border p-8 text-center space-y-3 bg-slate-50 dark:bg-[#0b1018]', className)}
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
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatDisplayDate(date)}</p>
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
    <>
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">{formatDisplayDate(date)}</p>
        <div className="flex flex-wrap items-center gap-4">
          {LEGEND.map((item) => (
            <span key={item.key} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <span className={cn('w-2.5 h-2.5 rounded-full', categoryScheduleLegendClass(item.key))} />
              {item.label}
            </span>
          ))}
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            {appointments.length} appts
          </span>
          <button
            type="button"
            onClick={() => void openFullscreen()}
            className="lg:hidden shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-brand-primary/40 hover:text-brand-primary transition-colors"
            style={{ borderColor: 'var(--color-surface-border)' }}
          >
            <Maximize2 size={12} />
            Full screen
          </button>
        </div>
      </div>

      {/* Desktop — technician time grid, unchanged */}
      <div
        className="hidden lg:block rounded-lg border overflow-hidden bg-slate-50 dark:bg-[#0b1018] shadow-inner"
        style={{ borderColor: 'var(--color-surface-border)' }}
      >
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Column headers — PBS style */}
            <div
              className="flex border-b bg-slate-100 dark:bg-[#0d1320]"
              style={{ borderColor: 'var(--color-surface-border)' }}
            >
              <div className="w-[52px] shrink-0 border-r" style={{ borderColor: 'var(--color-surface-border)' }} />
              {columns.map((column) => (
                <div
                  key={column.id || 'open'}
                  className="flex-1 min-w-[132px] px-2 py-2 border-r last:border-r-0 text-center"
                  style={{ borderColor: 'var(--color-surface-border)' }}
                >
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-900 dark:text-slate-100 truncate">
                    {column.id ? `Tech ${column.label}` : column.label}
                    <span className="text-slate-500 font-bold"> ({column.count})</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="flex relative">
              {/* Time axis */}
              <div
                className="w-[52px] shrink-0 border-r relative bg-slate-50 dark:bg-[#0b1018]"
                style={{ borderColor: 'var(--color-surface-border)', height: bounds.heightPx }}
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
                      className="flex-1 min-w-[132px] relative border-r last:border-r-0 bg-slate-50 dark:bg-[#0b1018]"
                      style={{ borderColor: 'var(--color-surface-border)', height: bounds.heightPx }}
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

      {/* Mobile — tech picker + chronological agenda, no side-scrolling */}
      <div className="lg:hidden space-y-3">
        <TechPickerRow
          columns={columns}
          totalCount={appointments.length}
          value={mobileTech}
          onChange={setMobileTech}
        />
        <AgendaList appointments={mobileAppointments} onSelect={setSelectedAppt} />
      </div>

      <p className="text-[10px] text-slate-600 px-1">
        Shop lunch blocked 12:00 PM – 1:00 PM · Tap an appointment for full details
      </p>
    </div>
    {isFullscreen ? (
      <DayScheduleFullscreenView
        date={date}
        appointments={sortedAppointments}
        columns={columns}
        capacity={capacity}
        onClose={closeFullscreen}
      />
    ) : null}
    </>
  );
}
