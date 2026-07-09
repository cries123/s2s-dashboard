import React, { useState, useEffect } from 'react';
import { 
  collection, doc, getDoc, setDoc, onSnapshot, serverTimestamp, deleteField, deleteDoc 
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { User, DailyStat } from '../../../types';
import { logSystemAction } from '../../../services/loggingService';
import { extractTextFromPDF } from '../../../utils/pdfExtractor';
import { recordDmsImportFailure, recordDmsImportSuccess } from '../../../lib/dmsImportHealth';
import { 
  ChevronLeft, ChevronRight, Save, Loader2, TrendingUp, Calendar as CalendarIcon, 
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
  extractReportDateFromAppointmentPdf,
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
import { filterAdvisorsByPerformanceRoster } from '../../../lib/advisorNameUtils';
import { defaultPerformanceAdvisorRoster } from '../../../constants/dealerDefaults';
import {
  buildOperationsViewPeriodOptions,
  formatArchiveMonthLabel,
  getActiveMonthDateRange,
} from '../../../lib/operationsViewPeriod';
import { PageHeader } from '../../layout/PageHeader';
import { PageSkeleton } from '../../ui/Skeleton';

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
          className="absolute top-0 bottom-0 w-0.5 bg-white/70 shadow-sm pointer-events-none z-10"
          style={{ left: '100%', transform: 'translateX(-50%)' }}
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
  const [weekOffset, setWeekOffset] = useState(0);
  const [targetValue, setTargetValue] = useState(20);
  const [laborTarget, setLaborTarget] = useState(500000);
  const [partsTarget, setPartsTarget] = useState(300000);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [pdfParsePreview, setPdfParsePreview] = useState<{
    fileName: string;
    reportDate: string;
    breakdown: { diagnosis: number; oilChange: number; recall: number; misc: number };
    total: number;
    parseMethod?: string;
  } | null>(null);
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
  const [performanceAdvisorRoster, setPerformanceAdvisorRoster] = useState(
    () => defaultPerformanceAdvisorRoster(currentDealershipId) ?? []
  );
  const [showPerformanceTools, setShowPerformanceTools] = useState(false);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);
  const rawTrackerStatsRef = React.useRef<DailyStat[]>([]);
  const viewPeriodOptions = React.useMemo(() => buildOperationsViewPeriodOptions(), []);

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
      const activeDocId = currentDealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${currentDealershipId}`;
      const archiveDocId = currentDealershipId === 'hyundai' ? `advisorReports_archive_${targetYearMonth}` : `advisorReports_${currentDealershipId}_archive_${targetYearMonth}`;
 
      const activeRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', activeDocId);
      const archiveRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', archiveDocId);
 
      const activeSnap = await getDoc(activeRef);
      if (activeSnap.exists()) {
        await setDoc(archiveRef, {
          ...activeSnap.data(),
          archivedAt: serverTimestamp(),
          isArchive: true,
          archiveMonth: targetYearMonth
        });
      }
 
      // 2. Archive Pot of Gold Progress
      const activePoGId = currentDealershipId === 'hyundai' ? 'potOfGold' : `potOfGold_${currentDealershipId}`;
      const archivePoGId = currentDealershipId === 'hyundai' ? `potOfGold_archive_${targetYearMonth}` : `potOfGold_${currentDealershipId}_archive_${targetYearMonth}`;
 
      const activePoGRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', activePoGId);
      const archivePoGRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', archivePoGId);
 
      const activePoGSnap = await getDoc(activePoGRef);
      if (activePoGSnap.exists()) {
        await setDoc(archivePoGRef, {
          ...activePoGSnap.data(),
          archivedAt: serverTimestamp(),
          isArchive: true,
          archiveMonth: targetYearMonth
        });
      }
 
      // 3. Archive Technician Efficiency
      const activeTechId = currentDealershipId === 'hyundai' ? 'technicianReports' : `technicianReports_${currentDealershipId}`;
      const archiveTechId = currentDealershipId === 'hyundai' ? `technicianReports_archive_${targetYearMonth}` : `technicianReports_${currentDealershipId}_archive_${targetYearMonth}`;
 
      const activeTechRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', activeTechId);
      const archiveTechRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', archiveTechId);
 
      const activeTechSnap = await getDoc(activeTechRef);
      if (activeTechSnap.exists()) {
        await setDoc(archiveTechRef, {
          ...activeTechSnap.data(),
          archivedAt: serverTimestamp(),
          isArchive: true,
          archiveMonth: targetYearMonth
        });
      }

      // Explicit ArchivePayload compliance: persist rich audit log metric record
      const auditLogRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'audit', 'imports', `${targetYearMonth}_archive_payload`);
      await setDoc(auditLogRef, {
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
      await setDoc(activeRef, {
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
        await setDoc(activePoGRef, {
          ...data,
          advData: clearedAdvData,
          techData: clearedTechData,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.username || currentUser.email || "System Archive Logic"
        });
      }
 
      // Reset Technician Reports in Active
      await setDoc(activeTechRef, {
        technicians: [],
        reportStartDate: activeMonthRange.start,
        reportEndDate: activeMonthRange.end,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.username || currentUser.email || "System Archive Logic"
      });
 
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

    // Fetch Performance for Gross Tracking
    const docId = currentDealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${currentDealershipId}`;
    const perfRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    const unsubPerf = onSnapshot(perfRef, (snap) => {
      if (snap.exists) {
        setActivePerformanceData(snap.data());
      } else {
        setActivePerformanceData(null);
      }
    });

    // Fetch Technician Reports for dynamic active tracking snapshots
    const activeTechId = currentDealershipId === 'hyundai' ? 'technicianReports' : `technicianReports_${currentDealershipId}`;
    const techRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', activeTechId);
    const unsubTech = onSnapshot(techRef, (snap) => {
      if (snap.exists) {
        setActiveTechData(snap.data());
      }
    });

    return () => {
      unsubSettings();
      unsubPerf();
      unsubTech();
    };
  }, [currentDealershipId]);

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
    const q = collection(db, path);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let stats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyStat));
      
      // Filter by dealershipId, allowing legacy data (no id) in Hyundai view
      stats = stats.filter(s => {
        if (currentDealershipId === 'hyundai') {
          return !s.dealershipId || s.dealershipId === 'hyundai';
        }
        return s.dealershipId === currentDealershipId;
      });

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

    if (existing?.breakdown) {
      setManualBreakdown(existing.breakdown);
    } else if (!Number.isNaN(countNum) && countNum > 0) {
      setManualBreakdown({
        diagnosis: 0,
        oilChange: 0,
        recall: 0,
        misc: countNum,
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result?.toString().split(',')[1];
        if (base64String) resolve(base64String);
        else reject(new Error("Failed to convert file to base64"));
      };
      reader.onerror = error => reject(error);
    });
  };

  const applyPdfBreakdown = async (
    targetDate: string,
    breakdown: { diagnosis: number; oilChange: number; recall: number; misc: number },
    totalCount: number,
    fileLabel: string
  ) => {
    await saveAppointmentDay(targetDate, totalCount, breakdown, 'pdf');
    onSuccess?.(
      `Updated ${targetDate} with ${totalCount} appointments from ${fileLabel} (replaced previous count): ` +
        `${breakdown.oilChange} oil, ${breakdown.diagnosis} diag, ${breakdown.recall} recall, ${breakdown.misc} misc.`
    );
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setIsUploadingPdf(true);

    try {
      const reportText = await extractTextFromPDF(file);

      const response = await fetch('/api/parse-appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportText }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to analyze report';
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = `Server Error (${response.status}): Malformed error response.`;
          }
        } else {
          const errText = await response.text();
          console.error('Server returned non-JSON error:', errText.substring(0, 200));
          errorMessage = `Server Error (${response.status}): ${response.statusText}.`;
        }
        throw new Error(errorMessage);
      }

      const rawData = await response.json();
      const breakdown = {
        diagnosis: rawData.diagnosis || 0,
        oilChange: rawData.oilChange || 0,
        recall: rawData.recall || 0,
        misc: rawData.misc || 0,
      };
      const sumBreakdown = Object.values(breakdown).reduce((a, b) => a + b, 0);
      const totalCount = sumBreakdown > 0 ? sumBreakdown : (rawData.total || 0);
      if (totalCount === 0) {
        throw new Error('No appointments found in this PDF. Use a PBS Appointment Details report for the selected day.');
      }

      const reportDate =
        rawData.reportDate ||
        extractReportDateFromAppointmentPdf(reportText) ||
        selectedDate;

      setPdfParsePreview({
        fileName: file.name,
        reportDate,
        breakdown,
        total: totalCount,
        parseMethod: rawData.parseMethod || (rawData.isAiParsed ? 'ai' : 'deterministic'),
      });
    } catch (err: any) {
      console.error('PDF Parse Error:', err);
      const message = err.message || 'Failed to analyze PDF report.';
      void recordDmsImportFailure(currentDealershipId || 'hyundai', {
        filename: file.name,
        importKind: 'appointments',
        error: message,
        userEmail: currentUser.email,
      });
      onError?.(message);
    } finally {
      setIsUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const confirmPdfParsePreview = async () => {
    if (!pdfParsePreview || !currentUser) return;
    setIsUploadingPdf(true);
    try {
      await applyPdfBreakdown(pdfParsePreview.reportDate, pdfParsePreview.breakdown, pdfParsePreview.total, pdfParsePreview.fileName);
      await recordDmsImportSuccess(currentDealershipId || 'hyundai', {
        filename: pdfParsePreview.fileName,
        importKind: 'appointments',
        userEmail: currentUser.email,
      });
      setPdfParsePreview(null);
    } catch (err: any) {
      const message = err.message || 'Failed to save parsed appointments.';
      void recordDmsImportFailure(currentDealershipId || 'hyundai', {
        filename: pdfParsePreview.fileName,
        importKind: 'appointments',
        error: message,
        userEmail: currentUser.email,
      });
      onError?.(message);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const effectiveAdvisorRoster = React.useMemo(
    () =>
      performanceAdvisorRoster.length > 0
        ? performanceAdvisorRoster
        : defaultPerformanceAdvisorRoster(currentDealershipId) ?? [],
    [performanceAdvisorRoster, currentDealershipId]
  );

  const resolvedPerformance = React.useMemo(() => {
    if (!activePerformanceData) return null;
    const advisors = filterAdvisorsByPerformanceRoster(
      activePerformanceData.advisors ?? [],
      effectiveAdvisorRoster
    );
    return resolvePerformanceTotalsFromDoc({
      ...activePerformanceData,
      advisors,
    });
  }, [activePerformanceData, effectiveAdvisorRoster]);

  const effectiveStats = React.useMemo(
    () => buildEffectiveAppointmentStats(allStats, selectedDate, dailyCount),
    [allStats, selectedDate, dailyCount]
  );

  const calculateMetrics = () => {
    return calculateAppointmentForecast({
      stats: effectiveStats,
      dailyTarget: targetValue,
      laborTarget,
      partsTarget,
      mtdGross: resolvedPerformance?.totalGross ?? 0,
      mtdLaborSales: resolvedPerformance?.totalLabor ?? 0,
      mtdPartsGross: resolvedPerformance?.totalGrossParts ?? 0,
      performanceReportEndDate: resolvedPerformance?.reportEndDate,
    });
  };

  const metrics = calculateMetrics();

  const prevTargetRef = React.useRef(targetValue);
  useEffect(() => {
    if (!loading && prevTargetRef.current !== targetValue) {
      onSuccess?.(`Daily Target updated to ${targetValue} units.`);
    }
    prevTargetRef.current = targetValue;
  }, [targetValue, loading, onSuccess]);

  const getWeekDays = () => {
    const today = new Date();
    const startOfWeek = new Date(today);
    // Align to Monday of current week, then add weekOffset
    startOfWeek.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) + (weekOffset * 7));
    startOfWeek.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = toLocalDateString(d);
      const stat = effectiveStats.find(s => s.date === dateStr);
      return {
        date: dateStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        monthLabel: d.toLocaleDateString('en-US', { month: 'short' }),
        dayNum: d.getDate(),
        count: stat ? stat.count : 0,
        hasData: !!stat
      };
    });
  };

  const weekDays = getWeekDays();

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
          <p className="crm-kpi-value text-3xl mt-1 tabular-nums">${Math.round(metrics.laborDailyAvg).toLocaleString()}<span className="text-lg text-slate-400 font-medium">/day</span></p>
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
                className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Previous day"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-semibold tabular-nums text-white pointer-events-none select-none">
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
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
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

      <div className="card-base overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
          <h3 className="crm-section-title flex items-center gap-2">
            <CalendarIcon size={16} className="text-brand-primary" />
            Weekly schedule volume
          </h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeekOffset((p) => p - 1)} className="btn-secondary p-2"><ChevronLeft size={14} /></button>
            <button type="button" onClick={() => setWeekOffset(0)} className="btn-secondary px-3 py-2 text-xs">This week</button>
            <button type="button" onClick={() => setWeekOffset((p) => p + 1)} className="btn-secondary p-2"><ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Date</th>
                <th className="text-right">Scheduled</th>
                <th className="text-right">vs goal ({targetValue})</th>
                <th className="text-right">Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {weekDays.map((day) => {
                const fullDayData = allStats.find((s) => s.date === day.date);
                const isSelected = selectedDate === day.date;
                const vsGoal = day.count - targetValue;
                return (
                  <tr
                    key={day.date}
                    onClick={() => {
                      setSelectedDate(day.date);
                      setDailyCount(day.count > 0 ? day.count.toString() : fullDayData ? '0' : '');
                    }}
                    className={cn('cursor-pointer', isSelected && 'bg-brand-primary/5')}
                  >
                    <td className="font-medium">{day.label}</td>
                    <td className="crm-label">{day.monthLabel} {day.dayNum}</td>
                    <td className="text-right font-semibold tabular-nums">{day.count}</td>
                    <td className={cn('text-right tabular-nums', vsGoal < 0 ? 'text-rose-600' : vsGoal === 0 ? 'text-amber-600' : 'text-emerald-600')}>
                      {vsGoal > 0 ? `+${vsGoal}` : vsGoal}
                    </td>
                    <td className="text-right">
                      {fullDayData?.breakdown ? (
                        <button
                          type="button"
                          className="text-xs text-brand-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowBreakdown(fullDayData);
                          }}
                        >
                          View
                        </button>
                      ) : (
                        <span className="crm-label">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Breakdown Modal */}
      <AnimatePresence>
        {(showBreakdown || showManualBreakdownEntry) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">
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
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  <div className={cn(
                    "p-6 rounded-2xl text-center border",
                    showManualBreakdownEntry ? "bg-slate-950 border-slate-800" : "bg-brand-primary/10 border-brand-primary/20"
                  )}>
                    <p className={cn(
                      "text-[10px] font-black uppercase tracking-widest mb-1",
                      showManualBreakdownEntry ? "text-slate-500" : "text-brand-primary"
                    )}>
                      Total Appointments
                    </p>
                    <p className="text-4xl font-black text-white">
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
                          <span className="text-[10px] font-black text-white uppercase tracking-widest">{item.label}</span>
                          {showManualBreakdownEntry ? (
                            <input 
                              type="number"
                              min="0"
                              value={manualBreakdown[item.key as keyof typeof manualBreakdown]}
                              onChange={(e) => setManualBreakdown(prev => ({
                                ...prev,
                                [item.key]: parseInt(e.target.value) || 0
                              }))}
                              className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-black text-white focus:ring-1 focus:ring-brand-primary outline-none text-right"
                            />
                          ) : (
                            <span className="text-xs font-black text-slate-300">{showBreakdown?.breakdown?.[item.key as keyof typeof showBreakdown.breakdown] || 0} Units</span>
                          )}
                        </div>
                        {!showManualBreakdownEntry && (
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
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
                    *Categorization based on PDF text analysis logic
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
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
              className="h-11 px-3 bg-slate-900 border border-white/10 hover:border-white/20 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer transition-all min-w-[150px]"
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
                    : "bg-slate-800 hover:bg-slate-750 border-white/5 text-slate-300 hover:text-white"
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
              className="h-11 px-6 bg-slate-800 hover:bg-slate-750 border border-white/5 text-slate-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 flex-1 sm:flex-none"
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

      <div className="card-base overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPerformanceTools((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="crm-section-title">Advisor & technician performance</span>
          <span className="crm-label">{showPerformanceTools ? 'Hide' : 'Expand'}</span>
        </button>
        {showPerformanceTools && (
          <div className="px-5 pb-5 space-y-8 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
            <AdvisorPerformance
              currentDealershipId={currentDealershipId}
              selectedMonth={selectedMonth}
              allowArchiveEditing={allowArchiveEditing}
            />
            <TechnicianEfficiency
              currentUser={currentUser}
              currentDealershipId={currentDealershipId}
              onSuccess={onSuccess}
              onError={onError}
              selectedMonth={selectedMonth}
              allowArchiveEditing={allowArchiveEditing}
            />
          </div>
        )}
      </div>


      {/* PDF parse preview */}
      <AnimatePresence>
        {pdfParsePreview && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setPdfParsePreview(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">Confirm PDF Import</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 truncate">{pdfParsePreview.fileName}</p>
              <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest mb-6">
                Updates {new Date(pdfParsePreview.reportDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — replaces existing count
              </p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { key: 'oilChange', label: 'Oil Changes', val: pdfParsePreview.breakdown.oilChange },
                  { key: 'diagnosis', label: 'Diagnosis', val: pdfParsePreview.breakdown.diagnosis },
                  { key: 'recall', label: 'Recalls', val: pdfParsePreview.breakdown.recall },
                  { key: 'misc', label: 'Misc', val: pdfParsePreview.breakdown.misc },
                ].map((row) => (
                  <div key={row.key} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{row.label}</p>
                    <p className="text-2xl font-black text-white">{row.val}</p>
                  </div>
                ))}
              </div>
              <p className="text-center text-3xl font-black text-brand-primary mb-2">{pdfParsePreview.total}</p>
              <p className="text-center text-[9px] font-black text-slate-500 uppercase tracking-widest mb-6">Total Appointments</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPdfParsePreview(null)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-widest">Cancel</button>
                <button type="button" onClick={confirmPdfParsePreview} disabled={isUploadingPdf} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
                  {isUploadingPdf ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  Apply Counts
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
