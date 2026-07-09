import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { db } from '../../../firebase';
import type { DailyStat, PerformanceAdvisorSlot, ScheduledAppointmentSlot } from '../../../types';
import { DayScheduleBoard } from './DayScheduleBoard';
import { PageHeader } from '../../layout/PageHeader';
import { PageSkeleton } from '../../ui/Skeleton';
import { cn } from '../../../lib/utils';
import { addDaysToDateString, dedupeDailyStatsByDate, toLocalDateString } from '../../../lib/appointmentTracker';
import { appointmentScheduleDocId } from '../../../lib/appointmentSchedule';
import { fetchDayAppointmentSchedule } from '../../../lib/appointmentScheduleApi';
import { dispatchTechRosterFromSettings } from '../../../lib/dispatchTechRoster';

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

    const path = 'artifacts/hyundai-sales-to-service/public/data/appointmentTracker';
    const q = collection(db, path);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let stats = snapshot.docs.map((row) => ({ id: row.id, ...row.data() } as DailyStat));
        stats = stats.filter((s) => {
          if (currentDealershipId === 'hyundai') {
            return !s.dealershipId || s.dealershipId === 'hyundai';
          }
          return s.dealershipId === currentDealershipId;
        });
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
      };
    });
  }, [weekOffset, trackerStats]);

  const handlePrevDay = () => setSelectedDate((d) => addDaysToDateString(d, -1));
  const handleNextDay = () => setSelectedDate((d) => addDaysToDateString(d, 1));
  const handleToday = () => {
    setSelectedDate(toLocalDateString(new Date()));
    setWeekOffset(0);
  };

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
        <div className="overflow-x-auto">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Date</th>
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
                    <td className="text-right font-semibold tabular-nums">{day.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-base p-4 sm:p-5">
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
