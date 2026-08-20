import React, { useState, useEffect } from 'react';
import {
  collection, doc, getDoc, setDoc, onSnapshot, serverTimestamp, deleteField, deleteDoc, query, where, writeBatch
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { User, DailyStat } from '../../../types';
import { logSystemAction } from '../../../services/loggingService';
import {
  ChevronLeft, ChevronRight, ChevronDown, Save, Loader2, TrendingUp,
  Target, Clock, X, Printer, Archive, Lock, Unlock
} from 'lucide-react';
import { AdvisorPerformance } from '../analytics/AdvisorPerformance';
import { TechnicianEfficiency } from './TechnicianEfficiency';
import { PerformancePrintModal } from './PerformancePrintModal';
import { ArchiveControlModal } from './ArchiveControlModal';
import { cn } from '../../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import {
  addDaysToDateString,
  appointmentTrackerDocId,
  dedupeDailyStatsByDate,
  findDuplicateTrackerDocs,
  listDuplicateTrackerDocIds,
  toLocalDateString,
} from '../../../lib/appointmentTracker';
import {
  buildEffectiveAppointmentStats,
  calculateAppointmentForecast,
  forecastGoalPercent,
} from '../../../lib/appointmentForecast';
import { resolvePerformanceTotalsFromDoc } from '../../../lib/performanceTotals';
import { defaultPerformanceAdvisorRoster } from '../../../constants/dealerDefaults';
import {
  buildOperationsViewPeriodOptions,
  formatArchiveMonthLabel,
  getActiveMonthDateRange,
  performanceDocId,
} from '../../../lib/operationsViewPeriod';
import { PageHeader } from '../../layout/PageHeader';
import { PageSkeleton } from '../../ui/Skeleton';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

interface AppointmentPacePoint {
  day: number;
  dateLabel: string;
  actual: number | null;
  goal: number;
}

/**
 * Cumulative appointments booked so far this month vs. the cumulative goal
 * pace (dailyTarget applied on working days only). Built from the same
 * per-day stats the KPI cards already use — no synthetic history.
 */
function buildAppointmentPaceSeries(
  stats: { date: string; count: number }[],
  dailyTarget: number,
  referenceDate: Date
): AppointmentPacePoint[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toLocalDateString(referenceDate);

  const countByDate = new Map<string, number>();
  stats.forEach((s) => {
    const d = new Date(`${s.date}T00:00:00`);
    if (d.getFullYear() === year && d.getMonth() === month) {
      countByDate.set(s.date, (countByDate.get(s.date) || 0) + (s.count || 0));
    }
  });

  const points: AppointmentPacePoint[] = [];
  let actualCumulative = 0;
  let goalCumulative = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateStr = toLocalDateString(date);
    const dayOfWeek = date.getDay();
    const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
    if (isWorkingDay) goalCumulative += dailyTarget;

    if (dateStr <= todayStr) {
      actualCumulative += countByDate.get(dateStr) || 0;
    }

    points.push({
      day: d,
      dateLabel: `${month + 1}/${d}`,
      actual: dateStr <= todayStr ? actualCumulative : null,
      goal: Math.round(goalCumulative),
    });
  }

  return points;
}

function ProjectionProgressBar({ percent, onTrack }: { percent: number; onTrack: boolean }) {
  const fillWidth = Math.min(100, Math.max(0, percent));
  return (
    <div className="relative pt-1">
      <div className="relative h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', onTrack ? 'bg-emerald-500' : 'bg-rose-500')}
          style={{ width: `${fillWidth}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 shadow-sm pointer-events-none z-10"
          style={{ left: '100%', transform: 'translateX(-50%)', backgroundColor: 'var(--color-text-primary)', opacity: 0.5 }}
          title="Monthly goal"
        />
      </div>
      <p className="crm-label mt-1 text-right tabular-nums">{percent}% of goal</p>
    </div>
  );
}

interface AppointmentsProps {
  currentUser: User;
  currentDealershipId: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export default function Appointments({ currentUser, currentDealershipId, onSuccess, onError }: AppointmentsProps) {
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateString(new Date()));
  const [dailyCount, setDailyCount] = useState<string>('');
  const [allStats, setAllStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [targetValue, setTargetValue] = useState(20);
  const [laborTarget, setLaborTarget] = useState(500000);
  const [partsTarget, setPartsTarget] = useState(300000);
  const [showBreakdown, setShowBreakdown] = useState<DailyStat | null>(null);
  const [showManualBreakdownEntry, setShowManualBreakdownEntry] = useState(false);
  const [manualBreakdown, setManualBreakdown] = useState({
    diagnosis: 0,
    oilChange: 0,
    recall: 0,
    misc: 0
  });
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('active');
  const [allowArchiveEditing, setAllowArchiveEditing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [activePerformanceData, setActivePerformanceData] = useState<any>(null);
  const [activeTechData, setActiveTechData] = useState<any>(null);
  const [mobileShowFull, setMobileShowFull] = useState(false);
  const [performanceAdvisorRoster, setPerformanceAdvisorRoster] = useState(
    () => defaultPerformanceAdvisorRoster(currentDealershipId) ?? []
  );
  const rawTrackerStatsRef = React.useRef<DailyStat[]>([]);
  const viewPeriodOptions = React.useMemo(() => buildOperationsViewPeriodOptions(), []);

  /** Lets the archive picker warn the user before an existing archive month gets overwritten. */
  const checkArchiveExists = async (targetYearMonth: string): Promise<boolean> => {
    if (!currentDealershipId) return false;
    const archiveDocId = performanceDocId('advisorReports', currentDealershipId, targetYearMonth);
    const archiveRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', archiveDocId);
    const archiveSnap = await getDoc(archiveRef);
    return archiveSnap.exists();
  };

  const handleArchiveAndReset = async (payload: {
    targetYearMonth: string;
    metricsSnapshot: {
      laborSales: number;
      laborGross: number;
      partsSales: number;
      partsGross: number;
      advisorBreakdown: any[];
      techBreakdown: any[];
    };
  }) => {
    if (!currentUser || !currentDealershipId) return;
    const { targetYearMonth } = payload;
    const activeMonthRange = getActiveMonthDateRange();
    setIsArchiving(true);
    try {
      // 1. Archive Advisor Performance
      const activeDocId = performanceDocId('advisorReports', currentDealershipId, 'active');
      const archiveDocId = performanceDocId('advisorReports', currentDealershipId, targetYearMonth);
      const activeRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', activeDocId);
      const archiveRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', archiveDocId);

      // 2. Archive Pot of Gold Progress
      const activePoGId = performanceDocId('potOfGold', currentDealershipId, 'active');
      const archivePoGId = performanceDocId('potOfGold', currentDealershipId, targetYearMonth);
      const activePoGRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', activePoGId);
      const archivePoGRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', archivePoGId);

      // 3. Archive Technician Efficiency
      const activeTechId = performanceDocId('technicianReports', currentDealershipId, 'active');
      const archiveTechId = performanceDocId('technicianReports', currentDealershipId, targetYearMonth);
      const activeTechRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', activeTechId);
      const archiveTechRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', archiveTechId);

      const auditLogRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'audit', 'imports', `${targetYearMonth}_archive_payload`);

      // Reads have to happen before the batch is built (Firestore batches are write-only).
      const [activeSnap, activePoGSnap, activeTechSnap] = await Promise.all([
        getDoc(activeRef),
        getDoc(activePoGRef),
        getDoc(activeTechRef),
      ]);

      // Single atomic batch: either every archive write + every reset write lands
      // together, or (on failure) none of them do — no more half-archived months.
      const batch = writeBatch(db);

      if (activeSnap.exists()) {
        batch.set(archiveRef, {
          ...activeSnap.data(),
          archivedAt: serverTimestamp(),
          isArchive: true,
          archiveMonth: targetYearMonth
        });
      }

      if (activePoGSnap.exists()) {
        batch.set(archivePoGRef, {
          ...activePoGSnap.data(),
          archivedAt: serverTimestamp(),
          isArchive: true,
          archiveMonth: targetYearMonth
        });
      }

      if (activeTechSnap.exists()) {
        batch.set(archiveTechRef, {
          ...activeTechSnap.data(),
          archivedAt: serverTimestamp(),
          isArchive: true,
          archiveMonth: targetYearMonth
        });
      }

      // Explicit ArchivePayload compliance: persist rich audit log metric record
      batch.set(auditLogRef, {
        targetYearMonth,
        dateArchived: new Date().toISOString(),
        metricsSnapshot: payload.metricsSnapshot,
        archivedBy: currentUser.username || currentUser.email || "System Archive Logic"
      });

      // 4. NOW RESET ACTIVE COPIES
      // Reset active advisors to clean empty sheet
      const initialAdvisors = [
        { name: "Frank", soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, gpPercent: 0, elr: 0, upsells: [] },
        { name: "Lemmy", soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, gpPercent: 0, elr: 0, upsells: [] },
        { name: "Jaryn", soCount: 0, hrsSold: 0, laborSold: 0, grossLabor: 0, partsSold: 0, grossParts: 0, totalSales: 0, gpPercent: 0, elr: 0, upsells: [] }
      ];
      batch.set(activeRef, {
        advisors: initialAdvisors,
        totals: {
          totalSales: 0,
          totalLabor: 0,
          totalGross: 0,
          totalParts: 0,
          totalGrossParts: 0,
          totalHrs: 0
        },
        reportStartDate: activeMonthRange.start,
        reportEndDate: activeMonthRange.end,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.username || currentUser.email || "System Archive Logic"
      });

      // Reset Pot of Gold statistics (keep payout settings but clear advisor/tech statistics)
      if (activePoGSnap.exists()) {
        const data = activePoGSnap.data();
        const clearedAdvData = (data.advData || []).map((row: any) => ({
          ...row,
          frank: 0,
          lemmy: 0
        }));
        const clearedTechData = (data.techData || []).map((row: any) => {
          const updatedRow = { ...row };
          Object.keys(updatedRow).forEach(key => {
            if (key !== 'code' && key !== 'desc') {
              updatedRow[key] = 0;
            }
          });
          return updatedRow;
        });
        batch.set(activePoGRef, {
          ...data,
          advData: clearedAdvData,
          techData: clearedTechData,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.username || currentUser.email || "System Archive Logic"
        });
      }

      // Reset Technician Reports in Active
      batch.set(activeTechRef, {
        technicians: [],
        reportStartDate: activeMonthRange.start,
        reportEndDate: activeMonthRange.end,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.username || currentUser.email || "System Archive Logic"
      });

      await batch.commit();

      setArchiveSuccess(`${targetYearMonth} records saved successfully! All active sheets started fresh.`);
      setTimeout(() => setArchiveSuccess(null), 6000);
      onSuccess?.(`${targetYearMonth} records saved successfully! All active sheets started fresh.`);
    } catch (err: any) {
      console.error("Archival failed:", err);
      onError?.("Archive failed: " + err.message);
    } finally {
      setIsArchiving(false);
    }
  };

  useEffect(() => {
    if (!currentDealershipId) return;

    // Fetch Settings
    const settingsRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings', currentDealershipId);
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTargetValue(data.appointmentTarget || 20);
        setLaborTarget(data.laborGrossTarget || 500000);
        setPartsTarget(data.partsSalesTarget || 300000);
        const roster = Array.isArray(data.performanceAdvisorRoster)
          ? data.performanceAdvisorRoster
          : defaultPerformanceAdvisorRoster(currentDealershipId) ?? [];
        setPerformanceAdvisorRoster(roster);
      }
    });

    // Fetch Performance for Gross Tracking — follows the View Period selector so
    // the Appt Forecast / Labor Pace / Month-End Projections cards show the same
    // month as the advisor/tech panels below, instead of always live current data.
    const docId = performanceDocId('advisorReports', currentDealershipId, selectedMonth);
    const perfRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    const unsubPerf = onSnapshot(perfRef, (snap) => {
      if (snap.exists) {
        setActivePerformanceData(snap.data());
      } else {
        setActivePerformanceData(null);
      }
    });

    // Fetch Technician Reports — same historical-month scoping as above.
    const activeTechId = performanceDocId('technicianReports', currentDealershipId, selectedMonth);
    const techRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', activeTechId);
    const unsubTech = onSnapshot(techRef, (snap) => {
      if (snap.exists) {
        setActiveTechData(snap.data());
      } else {
        setActiveTechData(null);
      }
    });

    return () => {
      unsubSettings();
      unsubPerf();
      unsubTech();
    };
  }, [currentDealershipId, selectedMonth]);

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
      },
      operationType,
      path
    };
    const errorMessage = `Firestore Error: ${errInfo.error} (${operationType} at ${path})`;
    console.error(errorMessage, JSON.stringify(errInfo));
    onError?.(errorMessage);
    throw new Error(JSON.stringify(errInfo));
  };

  useEffect(() => {
    if (!currentDealershipId) return;

    const path = 'artifacts/hyundai-sales-to-service/public/data/appointmentTracker';
    // Firestore security rules require an explicit dealershipId match to list this
    // collection (no more open collection-wide reads across tenants).
    const q = query(collection(db, path), where('dealershipId', '==', currentDealershipId || 'hyundai'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let stats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyStat));

      const dealershipId = currentDealershipId || 'hyundai';
      rawTrackerStatsRef.current = stats;

      // Remove legacy duplicate docs so MTD matches the weekly grid (e.g. 39 not 87).
      const duplicateIds = listDuplicateTrackerDocIds(stats, dealershipId);
      if (duplicateIds.length > 0) {
        const basePath = ['artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentTracker'] as const;
        void Promise.all(duplicateIds.map((id) => deleteDoc(doc(db, ...basePath, id)))).catch(
          (err) => console.warn('[Appointments] Duplicate tracker cleanup failed:', err)
        );
      }

      stats = dedupeDailyStatsByDate(stats, dealershipId);
      setAllStats(stats);

      const currentStat = stats.find(s => s.date === selectedDate);
      setDailyCount(currentStat ? currentStat.count.toString() : '');
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [selectedDate, currentDealershipId]);

  const handleSave = async () => {
    const countNum = parseInt(dailyCount, 10);
    const existing = allStats.find((s) => s.date === selectedDate);
    const newTotal = !Number.isNaN(countNum) && countNum > 0 ? countNum : 0;

    if (existing?.breakdown && existing.count > 0) {
      // Seed the modal from the NEW total the user just typed (not the old saved
      // total) by redistributing it proportionally across the existing breakdown
      // categories, so confirming never silently re-saves the stale count.
      const ratio = newTotal / existing.count;
      const diagnosis = Math.round((existing.breakdown.diagnosis || 0) * ratio);
      const oilChange = Math.round((existing.breakdown.oilChange || 0) * ratio);
      const recall = Math.round((existing.breakdown.recall || 0) * ratio);
      // Put the rounding remainder in misc so the buckets always sum to exactly
      // what the user typed.
      const misc = Math.max(0, newTotal - (diagnosis + oilChange + recall));
      setManualBreakdown({ diagnosis, oilChange, recall, misc });
    } else if (newTotal > 0) {
      setManualBreakdown({
        diagnosis: 0,
        oilChange: 0,
        recall: 0,
        misc: newTotal,
      });
    } else {
      setManualBreakdown({
        diagnosis: 0,
        oilChange: 0,
        recall: 0,
        misc: 0,
      });
    }
    setShowManualBreakdownEntry(true);
  };


  const saveAppointmentDay = async (
    date: string,
    totalCount: number,
    breakdown: { diagnosis: number; oilChange: number; recall: number; misc: number },
    source: 'pdf' | 'manual' | 'pbs'
  ) => {
    const dealershipId = currentDealershipId || 'hyundai';
    const docId = appointmentTrackerDocId(dealershipId, date);
    const basePath = ['artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentTracker'] as const;

    const duplicates = findDuplicateTrackerDocs(rawTrackerStatsRef.current, dealershipId, date);
    await Promise.all(
      duplicates.map((row) => deleteDoc(doc(db, ...basePath, row.id)))
    );

    await setDoc(doc(db, ...basePath, docId), {
      date,
      count: totalCount,
      dealershipId,
      breakdown,
      source,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser!.uid,
    });

    if (date !== selectedDate) {
      setSelectedDate(date);
    }
    setDailyCount(totalCount.toString());
    setManualBreakdown(breakdown);
  };

  const confirmManualSave = async () => {
    const totalCount = Object.values(manualBreakdown).reduce((a, b) => (a as number) + (b as number), 0) as number;
    
    setSaving(true);
    const path = `artifacts/hyundai-sales-to-service/public/data/appointmentTracker/${appointmentTrackerDocId(currentDealershipId || 'hyundai', selectedDate)}`;
    try {
      await saveAppointmentDay(selectedDate, totalCount, manualBreakdown, 'manual');

      await logSystemAction(
        "Appointments Updated",
        `Updated scheduled appointment count to ${totalCount} for date ${selectedDate} with customized service breakdown`,
        'appointments',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );

      setShowManualBreakdownEntry(false);
      onSuccess?.(`Recorded ${totalCount} appointments with breakdown for ${selectedDate}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSaving(false);
    }
  };

  const resolvedPerformance = React.useMemo(() => {
    if (!activePerformanceData) return null;
    return resolvePerformanceTotalsFromDoc(activePerformanceData);
  }, [activePerformanceData]);

  const effectiveStats = React.useMemo(
    () => buildEffectiveAppointmentStats(allStats, selectedDate, dailyCount),
    [allStats, selectedDate, dailyCount]
  );

  const metrics = React.useMemo(
    () => calculateAppointmentForecast({
      stats: effectiveStats,
      dailyTarget: targetValue,
      laborTarget,
      partsTarget,
      mtdGross: resolvedPerformance?.totalGross ?? 0,
      mtdLaborSales: resolvedPerformance?.totalLabor ?? 0,
      mtdPartsGross: resolvedPerformance?.totalGrossParts ?? 0,
      performanceReportEndDate: resolvedPerformance?.reportEndDate,
    }),
    [effectiveStats, targetValue, laborTarget, partsTarget, resolvedPerformance]
  );

  // null (not the hardcoded default) means "haven't seen a real settings snapshot
  // yet" — otherwise the first Firestore read for a dealership whose saved target
  // differs from the hardcoded default fires a bogus "updated" toast on page load.
  const prevTargetRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (!loading) {
      if (prevTargetRef.current !== null && prevTargetRef.current !== targetValue) {
        onSuccess?.(`Daily Target updated to ${targetValue} units.`);
      }
      prevTargetRef.current = targetValue;
    }
  }, [targetValue, loading, onSuccess]);

  const appointmentPaceSeries = React.useMemo(
    () => buildAppointmentPaceSeries(effectiveStats, targetValue, new Date()),
    [effectiveStats, targetValue]
  );
  const todayDayNum = new Date().getDate();

  const projectionRows = [
    { label: 'Labor gross', current: metrics.mtdGross, daily: metrics.laborDailyAvg, forecast: metrics.grossForecast, target: metrics.laborTarget, isCurrency: true },
    { label: 'Parts gross', current: metrics.mtdPartsGross, daily: metrics.partsDailyAvg, forecast: metrics.partsForecast, target: metrics.partsTarget, isCurrency: true },
    { label: 'Appointments', current: metrics.monthTotal, daily: Number(metrics.avgDaily), forecast: metrics.forecast, target: metrics.monthTarget, isCurrency: false },
  ];

  const formatProjectionValue = (value: number, isCurrency: boolean) =>
    isCurrency ? `$${Math.round(value).toLocaleString()}` : Math.round(value).toLocaleString();

  const formatSelectedDateLabel = (isoDate: string) =>
    new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });

  const handlePrevDay = () => {
    setSelectedDate(addDaysToDateString(selectedDate, -1));
  };

  const handleNextDay = () => {
    setSelectedDate(addDaysToDateString(selectedDate, 1));
  };

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <style>{`
        .custom-centered-date-input {
          text-align: center;
        }
        .custom-centered-date-input::-webkit-calendar-picker-indicator {
          display: none !important;
          -webkit-appearance: none;
        }
        .custom-centered-date-input::-moz-calendar-picker-indicator {
          display: none !important;
        }
        .custom-centered-date-input::-webkit-datetime-edit {
          text-align: center;
          margin: 0 auto;
        }
        .custom-centered-date-input::-webkit-datetime-edit-fields-wrapper {
          display: inline-flex;
          justify-content: center;
        }
      `}</style>

      <PageHeader
        title="Operations"
        description="Appointment volume, gross forecast, and daily shop performance."
        breadcrumbs={[{ label: 'Reports' }, { label: 'Operations' }]}
        actions={
          <span className="badge badge-info inline-flex items-center gap-1.5">
            <Target size={12} />
            Daily goal: {targetValue}
          </span>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card-base px-5 py-4">
          <p className="crm-label">Appt forecast</p>
          <p className="crm-kpi-value text-3xl mt-1 tabular-nums">{Math.round(metrics.forecast).toLocaleString()}</p>
          <p className="crm-label mt-1.5">
            {metrics.monthTotal.toLocaleString()} MTD · {metrics.daysRemaining} working days left
          </p>
        </div>
        <div className="card-base px-5 py-4">
          <p className="crm-label">Labor pace</p>
          <p className="crm-kpi-value text-3xl mt-1 tabular-nums">${Math.round(metrics.laborDailyAvg).toLocaleString()}<span className="text-lg font-medium" style={{ color: 'var(--color-text-secondary)' }}>/day</span></p>
          <p className="crm-label mt-1.5">
            ${Math.round(metrics.mtdGross).toLocaleString()} MTD · goal ${Math.round(metrics.laborTarget).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card-base p-5 col-span-1 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h2 className="crm-section-title flex items-center gap-2">
              <TrendingUp size={18} className="text-brand-primary" />
              Month-end projections
            </h2>
            <span className="crm-label">{metrics.daysRemaining} working days left</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {projectionRows.map((kpi) => {
              const completionPercent = forecastGoalPercent(kpi.forecast, kpi.target);
              const onTrack = kpi.forecast >= kpi.target;
              return (
                <div key={kpi.label} className="rounded-lg border p-4" style={{ borderColor: 'var(--color-surface-border)' }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="crm-label">{kpi.label}</span>
                    <span className={cn('badge text-[10px] shrink-0', onTrack ? 'badge-success' : 'badge-error')}>
                      {onTrack ? 'On track' : 'Shortfall'}
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                    Forecast
                  </p>
                  <p className="text-xl font-semibold tabular-nums mb-3">{formatProjectionValue(kpi.forecast, kpi.isCurrency)}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <div>
                      <p className="crm-label">MTD</p>
                      <p className="font-medium tabular-nums">{formatProjectionValue(kpi.current, kpi.isCurrency)}</p>
                    </div>
                    <div>
                      <p className="crm-label">Pace</p>
                      <p className="font-medium tabular-nums">
                        {kpi.isCurrency ? `$${Math.round(kpi.daily).toLocaleString()}` : kpi.daily.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="crm-label">Goal</p>
                      <p className="font-medium tabular-nums">{formatProjectionValue(kpi.target, kpi.isCurrency)}</p>
                    </div>
                  </div>
                  <ProjectionProgressBar percent={completionPercent} onTrack={onTrack} />
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="crm-label">Appointment pace — cumulative MTD vs. goal</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={appointmentPaceSeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-card)',
                    borderColor: 'var(--color-surface-border)',
                    borderRadius: '12px',
                  }}
                  labelStyle={{ color: 'var(--color-text-primary)', fontSize: '11px', fontWeight: 'bold' }}
                  formatter={(v: number) => Math.round(v).toLocaleString()}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: '#94a3b8', paddingTop: '8px' }} />
                <ReferenceLine
                  x={appointmentPaceSeries.find((p) => p.day === todayDayNum)?.dateLabel}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  label={{ value: 'Today', position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }}
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  name="Actual (cumulative)"
                  stroke="var(--color-brand-primary)"
                  strokeWidth={2}
                  fill="var(--color-brand-primary)"
                  fillOpacity={0.12}
                  connectNulls={false}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="goal"
                  name="Goal pace"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-base p-4 flex flex-col">
          <h4 className="crm-section-title mb-3 flex items-center gap-2 text-sm">
            <Clock size={14} className="text-brand-primary" /> Daily entry
          </h4>

          <div className="space-y-3 flex-1">
            <div
              className="relative flex items-center justify-center rounded-lg border py-2 px-9"
              style={{ borderColor: 'var(--color-surface-border)' }}
            >
              <button
                type="button"
                onClick={handlePrevDay}
                className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                  e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                aria-label="Previous day"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-semibold tabular-nums pointer-events-none select-none">
                {formatSelectedDateLabel(selectedDate)}
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch {} }}
                aria-label="Operations date"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer custom-centered-date-input"
              />
              <button
                type="button"
                onClick={handleNextDay}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                  e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                aria-label="Next day"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="flex items-stretch gap-2">
              <input
                type="number"
                value={dailyCount}
                onChange={(e) => setDailyCount(e.target.value)}
                placeholder="0"
                aria-label="Scheduled volume"
                className="input-field flex-1 text-lg font-semibold text-center tabular-nums py-2 min-w-0"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary px-4 shrink-0"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Modal — kept outside the mobile collapse below, since it can be
          triggered from the Daily entry save button above regardless of that state. */}
      <AnimatePresence>
        {(showBreakdown || showManualBreakdownEntry) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                    {showManualBreakdownEntry ? 'Manual Entry Breakdown' : 'Appointment Breakdown'}
                  </h3>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                    {new Date((showBreakdown?.date || selectedDate) + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowBreakdown(null);
                    setShowManualBreakdownEntry(false);
                  }}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  <div className={cn(
                    "p-6 rounded-2xl text-center border",
                    showManualBreakdownEntry ? "bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800" : "bg-brand-primary/10 border-brand-primary/20"
                  )}>
                    <p className={cn(
                      "text-[10px] font-black uppercase tracking-widest mb-1",
                      showManualBreakdownEntry ? "text-slate-500" : "text-brand-primary"
                    )}>
                      Total Appointments
                    </p>
                    <p className="text-4xl font-black text-slate-900 dark:text-white">
                      {showManualBreakdownEntry 
                        ? Object.values(manualBreakdown).reduce((a, b) => (a as number) + (b as number), 0)
                        : (showBreakdown?.count || 0)
                      }
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { key: 'diagnosis', label: 'Diagnosis', color: 'bg-brand-secondary', icon: 'DIAG' },
                    { key: 'oilChange', label: 'Synthetic Oil Changes', color: 'bg-emerald-500', icon: 'OIL' },
                    { key: 'recall', label: 'Recalls & Campaigns', color: 'bg-brand-primary', icon: 'RCL' },
                    { key: 'misc', label: 'Miscellaneous / Other', color: 'bg-slate-700', icon: 'MISC' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center gap-4 group">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-[8px] font-black text-white shadow-lg shrink-0", item.color)}>
                        {item.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">{item.label}</span>
                          {showManualBreakdownEntry ? (
                            <input
                              type="number"
                              min="0"
                              value={manualBreakdown[item.key as keyof typeof manualBreakdown]}
                              onChange={(e) => setManualBreakdown(prev => ({
                                ...prev,
                                [item.key]: parseInt(e.target.value) || 0
                              }))}
                              className="w-20 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-black text-slate-900 dark:text-white focus:ring-1 focus:ring-brand-primary outline-none text-right"
                            />
                          ) : (
                            <span className="text-xs font-black text-slate-600 dark:text-slate-300">{showBreakdown?.breakdown?.[item.key as keyof typeof showBreakdown.breakdown] || 0} Units</span>
                          )}
                        </div>
                        {!showManualBreakdownEntry && (
                          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${((showBreakdown?.breakdown?.[item.key as keyof typeof showBreakdown.breakdown] || 0) / (showBreakdown?.count || 1)) * 100}%` }}
                              className={cn("h-full", item.color)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {showManualBreakdownEntry ? (
                  <button 
                    onClick={confirmManualSave}
                    disabled={saving}
                    className="w-full btn-primary h-14 flex items-center justify-center gap-2 mt-4"
                  >
                    {saving ? <Loader2 className="animate-spin" size={20} /> : <><Save size={18} /> Confirm & Save Count</>}
                  </button>
                ) : (
                  <p className="text-[10px] text-slate-500 italic text-center font-bold uppercase tracking-widest pt-4">
                    *Saved breakdown for this day
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile-only: the daily-entry tools and advisor/tech breakdowns below are
          collapsed by default on small screens so Operations opens to a quick
          summary instead of a long scroll. Always visible at lg+ widths. */}
      <button
        type="button"
        onClick={() => setMobileShowFull((v) => !v)}
        className="lg:hidden w-full card-base px-5 py-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
        style={{ color: 'var(--color-text-secondary)' }}
        aria-expanded={mobileShowFull}
      >
        {mobileShowFull ? 'Show less' : 'Show full report'}
        <ChevronDown size={14} className={cn('transition-transform', mobileShowFull && 'rotate-180')} />
      </button>

      <div className={cn(mobileShowFull ? 'flex' : 'hidden', 'lg:flex flex-col gap-6')}>

      <div className="card-base p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
              <h4 className="crm-section-title">Performance tools & audit</h4>
              {selectedMonth !== 'active' ? (
                allowArchiveEditing ? (
                  <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] font-black uppercase tracking-widest rounded-full flex items-center gap-1 animate-pulse">
                    <span>🔓 Archive Edit Unlocked</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[8px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
                    <span>🔒 Saved Archive</span>
                  </span>
                )
              ) : (
                <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
                  <span>● Live Tracking</span>
                </span>
              )}
            </div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wide">
              {selectedMonth === 'active' 
                ? "Active performance workspace for the current month. Save last month's figures first before restarting."
                : allowArchiveEditing
                  ? `Archive editing enabled. Any manual entry or PDF import will update the saved numbers for ${formatArchiveMonthLabel(selectedMonth)}.`
                  : "Displaying historical database metrics in read-only audit mode."
              }
            </p>
        </div>

        {/* Dynamic Controls Grid */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Month Period Dropdown */}
          <div className="flex flex-col gap-1 flex-1 sm:flex-initial">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">View Period</span>
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setAllowArchiveEditing(false); // automatically reset to locked on toggle
              }}
              className="h-11 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer transition-all min-w-[150px]"
            >
              {viewPeriodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-3 flex-1 sm:flex-initial mt-4 sm:mt-0 pt-1 lg:pt-0">
            {/* Lock / Unlock Archive Editing */}
            {selectedMonth !== 'active' && (
              <button
                onClick={() => setAllowArchiveEditing(!allowArchiveEditing)}
                className={cn(
                  "h-11 px-6 border text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 flex-1 sm:flex-none rounded-xl",
                  allowArchiveEditing 
                    ? "bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 text-amber-500 shadow-lg shadow-amber-500/5 animate-pulse" 
                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                )}
                title="Unlock editing capability for this historical archive month"
              >
                {allowArchiveEditing ? <Unlock size={13} /> : <Lock size={13} />}
                {allowArchiveEditing ? "Lock Archive (Save)" : "Unlock to Edit"}
              </button>
            )}

            {/* Dynamic Custom Archive Option - Only clickable with active tracker */}
            {selectedMonth === 'active' && (
              <button
                onClick={() => setShowArchiveModal(true)}
                className="h-11 px-6 bg-brand-primary/10 hover:bg-brand-primary/15 border border-brand-primary/20 text-brand-primary hover:text-brand-primary/95 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 flex-1 sm:flex-none"
                title="Configure custom destination archive period and restart workspace"
              >
                <Archive size={13} />
                Archive & Restart Monthly
              </button>
            )}
 
            <button
              onClick={() => setIsPrintModalOpen(true)}
              className="h-11 px-6 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 flex-1 sm:flex-none"
            >
              <Printer size={13} />
              Print Report
            </button>
          </div>
        </div>
      </div>
 
      {/* Refactored Architecture Archive Configuration Picker Modal */}
      <ArchiveControlModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        currentData={{
          totalThroughput: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
            resolvedPerformance?.totalSales ?? 0
          ),
          laborGross: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
            resolvedPerformance?.totalGross ?? 0
          ),
          rawValues: {
            laborSales: resolvedPerformance?.totalLabor ?? 0,
            laborGross: resolvedPerformance?.totalGross ?? 0,
            partsSales: resolvedPerformance?.totalParts ?? 0,
            partsGross: resolvedPerformance?.totalGrossParts ?? 0,
            advisorBreakdown: activePerformanceData?.advisors || [],
            techBreakdown: activeTechData?.technicians || []
          }
        }}
        onConfirmArchive={(payload) => handleArchiveAndReset(payload)}
        onCheckExistingArchive={checkArchiveExists}
      />

      {/* Success Banner */}
      <AnimatePresence>
        {archiveSuccess && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-3 shadow-lg mb-6"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            <p>{archiveSuccess}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card-base p-5">
        <AdvisorPerformance
          currentDealershipId={currentDealershipId}
          selectedMonth={selectedMonth}
          allowArchiveEditing={allowArchiveEditing}
        />
      </div>

      <div className="card-base p-5">
        <TechnicianEfficiency
          currentUser={currentUser}
          currentDealershipId={currentDealershipId}
          onSuccess={onSuccess}
          onError={onError}
          selectedMonth={selectedMonth}
          allowArchiveEditing={allowArchiveEditing}
          embedded
        />
      </div>

      </div>

      {/* Executive Print / PDF Modal */}
      <PerformancePrintModal 
        isOpen={isPrintModalOpen} 
        onClose={() => setIsPrintModalOpen(false)} 
        currentDealershipId={currentDealershipId} 
        selectedMonth={selectedMonth}
      />
    </div>
  );
}
