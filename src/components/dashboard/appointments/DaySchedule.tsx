import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { db } from '../../../firebase';
import type { DailyStat, PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../../../types';
import { DayScheduleBoard } from './DayScheduleBoard';
import { PageHeader } from '../../layout/PageHeader';
import { PageSkeleton } from '../../ui/Skeleton';
import { cn } from '../../../lib/utils';
import { addDaysToDateString, dedupeDailyStatsByDate, toLocalDateString } from '../../../lib/appointmentTracker';
import {
  appointmentScheduleDocId,
  CAPACITY_STATUS_STYLES,
  computeScheduleCapacity,
  formatScheduleDurationLabel,
  SCHEDULE_HOURS_PER_TECH_PER_DAY,
} from '../../../lib/appointmentSchedule';
import { fetchDayAppointmentSchedule } from '../../../lib/appointmentScheduleApi';
import { dispatchTechRosterFromSettings } from '../../../lib/dispatchTechRoster';
import { isPreviewMode } from '../../../lib/previewMode';
import { buildPreviewDaySchedule } from '../../../lib/previewFixtures';

interface DayScheduleProps {
  currentDealershipId: string;
  onError?: (msg: string) => void;
}

export default function DaySchedule({ currentDealershipId, onError }: DayScheduleProps) {
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateString(new Date()));
  const [weekOffset, setWeekOffset] = useState(0);
  const [trackerStats, setTrackerStats] = useState<DailyStat[]>([]);
  const [loadingTracker, setLoadingTracker] = useState(true);
  const [appointments, setAppointments] = useState<ScheduledAppointmentSlot[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleHydrating, setScheduleHydrating] = useState(false);
  const [scheduleLoadError, setScheduleLoadError] = useState<string | null>(null);
  const [dispatchTechRoster, setDispatchTechRoster] = useState<PerformanceAdvisorSlot[]>([]);

  useEffect(() => {
    if (!currentDealershipId) return;

    const settingsRef = doc(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'dealershipSettings',
      currentDealershipId
    );

    const unsubscribe = onSnapshot(settingsRef, (snap) => {
      if (snap.exists) {
        const data = snap.data();
        setDispatchTechRoster(
          dispatchTechRosterFromSettings(
            { dispatchTechRoster: data.dispatchTechRoster },
            currentDealershipId
          )
        );
      }
    });

    return () => unsubscribe();
  }, [currentDealershipId]);

  useEffect(() => {
    if (!currentDealershipId) return;

    if (isPreviewMode) {
      const previewSlots = buildPreviewDaySchedule();
      setTrackerStats([
        {
          id: 'preview-today',
          date: toLocalDateString(new Date()),
          count: previewSlots.length,
          updatedAt: undefined as never,
          breakdown: { diagnosis: 3, oilChange: 4, recall: 2, misc: 1 },
        },
      ]);
      setLoadingTracker(false);
      return;
    }

    const path = 'artifacts/hyundai-sales-to-service/public/data/appointmentTracker';
    // Firestore security rules require an explicit dealershipId match to list this
    // collection (no more open collection-wide reads across tenants).
    const q = query(collection(db, path), where('dealershipId', '==', currentDealershipId || 'hyundai'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const stats = snapshot.docs.map((row) => ({ id: row.id, ...row.data() } as DailyStat));
        setTrackerStats(dedupeDailyStatsByDate(stats, currentDealershipId));
        setLoadingTracker(false);
      },
      (error) => {
        console.error('[DaySchedule] tracker snapshot error', error);
        onError?.('Could not load appointment counts.');
        setLoadingTracker(false);
      }
    );

    return () => unsubscribe();
  }, [currentDealershipId, onError]);

  const trackerCount = useMemo(
    () => trackerStats.find((row) => row.date === selectedDate)?.count ?? 0,
    [trackerStats, selectedDate]
  );

  useEffect(() => {
    if (!selectedDate || !currentDealershipId) {
      setAppointments([]);
      setScheduleLoadError(null);
      return;
    }

    if (isPreviewMode) {
      setAppointments(selectedDate === toLocalDateString(new Date()) ? buildPreviewDaySchedule() : []);
      setScheduleLoading(false);
      setScheduleLoadError(null);
      return;
    }

    const docId = appointmentScheduleDocId(currentDealershipId, selectedDate);
    const scheduleRef = doc(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'appointmentSchedule',
      docId
    );
    const canHydrateFromPbs = currentDealershipId === 'hyundai';

    let cancelled = false;

    const hydrateFromPbs = async (refresh = false) => {
      if (!canHydrateFromPbs) return;
      setScheduleHydrating(true);
      setScheduleLoadError(null);
      try {
        const result = await fetchDayAppointmentSchedule(selectedDate, { refresh });
        if (cancelled) return;
        setAppointments(result.appointments);
        if (result.appointments.length === 0 && trackerCount > 0) {
          setScheduleLoadError(
            `PBS returned 0 schedulable appointments for ${selectedDate} (${trackerCount} counted in Operations).`
          );
        }
      } catch (err) {
        if (cancelled) return;
        setScheduleLoadError(err instanceof Error ? err.message : 'Failed to load schedule from PBS.');
      } finally {
        if (!cancelled) {
          setScheduleHydrating(false);
          setScheduleLoading(false);
        }
      }
    };

    setScheduleLoading(true);
    setScheduleLoadError(null);

    if (trackerCount > 0 && canHydrateFromPbs) {
      void hydrateFromPbs(false);
    }

    const unsubscribe = onSnapshot(
      scheduleRef,
      (snap) => {
        if (cancelled) return;
        const slots = snap.exists
          ? ((snap.data()?.appointments as ScheduledAppointmentSlot[]) || [])
          : [];
        if (slots.length > 0) {
          setAppointments(slots);
          setScheduleLoading(false);
          setScheduleHydrating(false);
        } else if (trackerCount === 0) {
          setAppointments([]);
          setScheduleLoading(false);
        }
      },
      (error) => {
        if (cancelled) return;
        console.error('[DaySchedule] schedule snapshot error', error);
        setAppointments([]);
        setScheduleLoading(false);
        if (trackerCount > 0 && canHydrateFromPbs) {
          void hydrateFromPbs(false);
        } else {
          setScheduleLoadError('Could not read the stored day schedule.');
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedDate, currentDealershipId, trackerCount]);

  const refreshScheduleFromPbs = useCallback(async () => {
    if (!selectedDate || currentDealershipId !== 'hyundai') return;
    setScheduleHydrating(true);
    setScheduleLoadError(null);
    try {
      const result = await fetchDayAppointmentSchedule(selectedDate, { refresh: true });
      setAppointments(result.appointments);
      if (result.appointments.length === 0 && trackerCount > 0) {
        setScheduleLoadError(
          `PBS returned 0 schedulable appointments for ${selectedDate} (${trackerCount} counted in Operations).`
        );
      }
    } catch (err) {
      setScheduleLoadError(err instanceof Error ? err.message : 'Failed to load schedule from PBS.');
    } finally {
      setScheduleHydrating(false);
    }
  }, [selectedDate, currentDealershipId, trackerCount]);

  const weekDays = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) + weekOffset * 7);
    startOfWeek.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = toLocalDateString(d);
      const stat = trackerStats.find((s) => s.date === dateStr);
      return {
        date: dateStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        monthLabel: d.toLocaleDateString('en-US', { month: 'short' }),
        dayNum: d.getDate(),
        count: stat?.count ?? 0,
        breakdown: stat?.breakdown ?? { diagnosis: 0, oilChange: 0, recall: 0, misc: 0 },
      };
    });
  }, [weekOffset, trackerStats]);

  const handlePrevDay = () => setSelectedDate((d) => addDaysToDateString(d, -1));
  const handleNextDay = () => setSelectedDate((d) => addDaysToDateString(d, 1));
  const handleToday = () => {
    setSelectedDate(toLocalDateString(new Date()));
    setWeekOffset(0);
  };

  const capacity = useMemo(
    () => computeScheduleCapacity(appointments, dispatchTechRoster),
    [appointments, dispatchTechRoster]
  );

  const selectedDateShortLabel = useMemo(
    () =>
      new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [selectedDate]
  );

  if (loadingTracker) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="Schedule"
        description="Daily appointments by technician from PBS — tap an appointment for details."
        actions={
          currentDealershipId === 'hyundai' ? (
            <button
              type="button"
              onClick={() => void refreshScheduleFromPbs()}
              disabled={scheduleHydrating}
              className="btn-secondary text-xs px-3 py-2 inline-flex items-center gap-2"
            >
              {scheduleHydrating ? <Loader2 className="animate-spin" size={14} /> : null}
              Refresh from PBS
            </button>
          ) : null
        }
      />

      <div className="card-base p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="crm-label">Today's operational capacity</p>
            <p className="text-4xl font-black tracking-tight mt-1">{capacity.utilizationPercent}%</p>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-full whitespace-nowrap',
              CAPACITY_STATUS_STYLES[capacity.status].chip
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
            {CAPACITY_STATUS_STYLES[capacity.status].label}
          </span>
        </div>

        <div className={cn('relative h-2.5 rounded-full mt-4 mb-3 overflow-hidden', CAPACITY_STATUS_STYLES[capacity.status].track)}>
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full transition-all', CAPACITY_STATUS_STYLES[capacity.status].fill)}
            style={{ width: `${Math.min(100, capacity.utilizationPercent)}%` }}
          />
        </div>

        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <strong className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {formatScheduleDurationLabel(capacity.scheduledMinutes)}
          </strong>{' '}
          scheduled of{' '}
          <strong className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {formatScheduleDurationLabel(capacity.capacityMinutes)}
          </strong>{' '}
          available
        </p>

        <div
          className="flex items-center justify-between mt-3 pt-3 border-t text-xs"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <span style={{ color: 'var(--color-text-secondary)' }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>{capacity.techCount}</strong>{' '}
            technician{capacity.techCount === 1 ? '' : 's'} × {SCHEDULE_HOURS_PER_TECH_PER_DAY}h/day
          </span>
          <span style={{ color: 'var(--color-text-secondary)' }}>{selectedDateShortLabel}</span>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
          <h3 className="crm-section-title flex items-center gap-2">
            <CalendarIcon size={16} className="text-brand-primary" />
            Week at a glance
          </h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeekOffset((p) => p - 1)} className="btn-secondary p-2" aria-label="Previous week">
              <ChevronLeft size={14} />
            </button>
            <button type="button" onClick={() => setWeekOffset(0)} className="btn-secondary px-3 py-2 text-xs">
              This week
            </button>
            <button type="button" onClick={() => setWeekOffset((p) => p + 1)} className="btn-secondary p-2" aria-label="Next week">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        {/* Desktop — unchanged table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Date</th>
                <th className="text-right">Oil changes</th>
                <th className="text-right">Diags</th>
                <th className="text-right">Recall / warranty</th>
                <th className="text-right">Misc</th>
                <th className="text-right">Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {weekDays.map((day) => {
                const isSelected = selectedDate === day.date;
                return (
                  <tr
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={cn('cursor-pointer', isSelected && 'bg-brand-primary/5')}
                  >
                    <td className="font-medium">{day.label}</td>
                    <td className="crm-label">
                      {day.monthLabel} {day.dayNum}
                    </td>
                    <td className="text-right tabular-nums text-emerald-500 font-medium">
                      {day.breakdown.oilChange || '—'}
                    </td>
                    <td className="text-right tabular-nums text-sky-500 font-medium">
                      {day.breakdown.diagnosis || '—'}
                    </td>
                    <td className="text-right tabular-nums text-amber-500 font-medium">
                      {day.breakdown.recall || '—'}
                    </td>
                    <td className="text-right tabular-nums text-slate-400">
                      {day.breakdown.misc || '—'}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{day.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile — condensed day cards, total appointments always visible up front */}
        <div className="lg:hidden divide-y" style={{ borderColor: 'var(--color-surface-border)' }}>
          {weekDays.map((day) => {
            const isSelected = selectedDate === day.date;
            const parts: string[] = [];
            if (day.breakdown.oilChange) parts.push(`${day.breakdown.oilChange} oil`);
            if (day.breakdown.diagnosis) parts.push(`${day.breakdown.diagnosis} diag`);
            if (day.breakdown.recall) parts.push(`${day.breakdown.recall} recall`);
            if (day.breakdown.misc) parts.push(`${day.breakdown.misc} misc`);

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  isSelected ? 'bg-brand-primary/5' : 'hover:bg-slate-500/5'
                )}
              >
                <div className="w-11 shrink-0">
                  <p className="text-xs font-black">{day.label}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {day.monthLabel} {day.dayNum}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {parts.length > 0 ? parts.join(' · ') : 'No appointments'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-black tabular-nums leading-none">
                    {day.count}
                    <span className="text-[9px] font-bold uppercase ml-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      appts
                    </span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <p className="px-4 py-2.5 text-[10px] text-slate-500 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
          Visits combining an oil change with other work (recall, diag) count as oil changes.
        </p>
      </div>

      <div className="card-base p-3 sm:p-4 bg-[#080c14]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field text-sm py-2 px-3 mx-1"
              aria-label="Select date"
            />
            <button
              type="button"
              onClick={handleNextDay}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Next day"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button type="button" onClick={handleToday} className="btn-secondary text-xs px-3 py-2">
            Today
          </button>
        </div>

        <DayScheduleBoard
          date={selectedDate}
          appointments={appointments}
          techRoster={dispatchTechRoster}
          expectedCount={trackerCount}
          loading={scheduleLoading || scheduleHydrating}
          error={scheduleLoadError}
          onRefresh={currentDealershipId === 'hyundai' ? refreshScheduleFromPbs : undefined}
        />
      </div>
    </div>
  );
}
