import React, { useState, useEffect } from 'react';
import {
  TrendingUp, Users, DollarSign, Clock, Loader2, CheckCircle2, ChevronRight, BarChart3, Target, X, Keyboard, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import { ManualPerformanceEntry } from './ManualPerformanceEntry';
import { EmptyState } from '../../ui/EmptyState';
import { KpiStrip } from '../../ui/KpiStrip';
import { KpiStripSkeleton, TableSkeleton } from '../../ui/Skeleton';
import {
  EMPTY_PERFORMANCE_TOTALS,
  formatArchiveMonthLabel,
  formatArchiveDisplayLabel,
  getActiveMonthDateRange,
  performanceDocId,
} from '../../../lib/operationsViewPeriod';
import type { DmsProviderId } from '../../../constants/dmsProviders';
import { normalizeDmsProvider } from '../../../constants/dmsProviders';
import {
  defaultDmsProviderForDealership,
  defaultPerformanceAdvisorRoster,
} from '../../../constants/dealerDefaults';
import {
  cleanAdvisorName,
  filterAdvisorsByPerformanceRoster,
  isPhantomPbsAdvisorName,
  isRealAdvisorName,
  matchesPerformanceAdvisorRoster,
  mergePerformanceAdvisorsWithRoster,
} from '../../../lib/advisorNameUtils';
import type { PerformanceAdvisorSlot } from '../../../types';
import {
  computeAdvisorMix,
  type AdvisorMixRow,
} from '../../../lib/operationsPayTypes';
import { resolvePerformanceTotalsFromDoc, workingDaysThroughIsoDate } from '../../../lib/performanceTotals';

interface UpsellItem {
  code: string;
  description: string;
  count: number;
  revenue: number;
}

interface AdvisorData {
  name: string;
  soCount: number;
  hrsSold: number;
  laborSold: number; // Labor Sales
  grossLabor: number; // Gross Labor
  partsSold: number; // Part Sales
  grossParts: number; // Gross Part Sales
  totalSales: number; // Dept Total
  gpPercent: number;
  elr: number;
  upsells?: UpsellItem[];
  upsellCount?: number; // Manually entered upsell count (PDF-derived upsell line items are no longer imported)
}

interface AdvisorPerformanceProps {
  currentDealershipId: string;
  selectedMonth?: string;
  allowArchiveEditing?: boolean;
}

export const AdvisorPerformance: React.FC<AdvisorPerformanceProps> = ({ currentDealershipId, selectedMonth = 'active', allowArchiveEditing = false }) => {
  const { user } = useAuth();
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [advisors, setAdvisors] = useState<AdvisorData[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [reportStartDate, setReportStartDate] = useState<string | undefined>();
  const [reportEndDate, setReportEndDate] = useState<string | undefined>();
  const [advisorMix, setAdvisorMix] = useState<AdvisorMixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [laborTarget, setLaborTarget] = useState(500000);
  const [dmsProvider, setDmsProvider] = useState<DmsProviderId>(() =>
    defaultDmsProviderForDealership(currentDealershipId)
  );
  const [performanceAdvisorRoster, setPerformanceAdvisorRoster] = useState<PerformanceAdvisorSlot[]>(() =>
    defaultPerformanceAdvisorRoster(currentDealershipId) ?? []
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pbsSyncedAt, setPbsSyncedAt] = useState<string | null>(null);
  const [performanceSource, setPerformanceSource] = useState<string | null>(null);
  const [partsInvoicesSkipped, setPartsInvoicesSkipped] = useState(false);
  const [partsInvoicesSkipReason, setPartsInvoicesSkipReason] = useState<string | null>(null);
  const [unmatchedAdvisorNames, setUnmatchedAdvisorNames] = useState<string[]>([]);

  // Fetch Dealership Settings (for target)
  useEffect(() => {
    if (!currentDealershipId) return;
    const settingsRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings', currentDealershipId);
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLaborTarget(data.laborGrossTarget || 500000);
        setDmsProvider(
          data.dmsProvider
            ? normalizeDmsProvider(data.dmsProvider as string)
            : defaultDmsProviderForDealership(currentDealershipId)
        );
        const roster = Array.isArray(data.performanceAdvisorRoster)
          ? data.performanceAdvisorRoster
          : defaultPerformanceAdvisorRoster(currentDealershipId) ?? [];
        setPerformanceAdvisorRoster(roster);
      } else {
        setDmsProvider(defaultDmsProviderForDealership(currentDealershipId));
        setPerformanceAdvisorRoster(defaultPerformanceAdvisorRoster(currentDealershipId) ?? []);
      }
    });
    return () => unsubscribe();
  }, [currentDealershipId]);

  useEffect(() => {
    setDmsProvider(defaultDmsProviderForDealership(currentDealershipId));
    setPerformanceAdvisorRoster(defaultPerformanceAdvisorRoster(currentDealershipId) ?? []);
  }, [currentDealershipId]);

  // realtime performance sync
  useEffect(() => {
    if (!user || !currentDealershipId) return;

    const docId = performanceDocId('advisorReports', currentDealershipId, selectedMonth);
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.advisors) {
          setAdvisors(data.advisors);
        } else {
          setAdvisors([]);
        }
        if (data.totals) setTotals(data.totals);
        setReportStartDate(data.reportStartDate);
        setReportEndDate(data.reportEndDate);
        setPbsSyncedAt(typeof data.pbsSyncedAt === 'string' ? data.pbsSyncedAt : null);
        setPerformanceSource(typeof data.source === 'string' ? data.source : null);
        setPartsInvoicesSkipped(data.partsInvoicesSkipped === true);
        setPartsInvoicesSkipReason(
          typeof data.partsInvoicesSkipReason === 'string' ? data.partsInvoicesSkipReason : null
        );
        setUnmatchedAdvisorNames(
          Array.isArray(data.unmatchedAdvisorNames)
            ? data.unmatchedAdvisorNames.filter((n: unknown) => typeof n === 'string')
            : []
        );
        if (data.advisorMix?.length) setAdvisorMix(data.advisorMix as AdvisorMixRow[]);
        else if (data.advisors?.length) setAdvisorMix(computeAdvisorMix(data.advisors));
        else setAdvisorMix([]);
      } else {
        setAdvisors([]);
        setTotals(null);
        setReportStartDate(undefined);
        setReportEndDate(undefined);
        setPbsSyncedAt(null);
        setPerformanceSource(null);
        setPartsInvoicesSkipped(false);
        setPartsInvoicesSkipReason(null);
        setAdvisorMix([]);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore sync error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user, currentDealershipId, selectedMonth]);

  const effectiveDmsProvider: DmsProviderId =
    dmsProvider || defaultDmsProviderForDealership(currentDealershipId);
  const effectiveAdvisorRoster: PerformanceAdvisorSlot[] =
    performanceAdvisorRoster.length > 0
      ? performanceAdvisorRoster
      : defaultPerformanceAdvisorRoster(currentDealershipId) ?? [];

  const visibleAdvisors = React.useMemo(() => {
    if (effectiveAdvisorRoster.length === 0) {
      return advisors;
    }
    return mergePerformanceAdvisorsWithRoster(advisors, effectiveAdvisorRoster);
  }, [advisors, effectiveAdvisorRoster]);

  const isPbsDealership = effectiveDmsProvider === 'pbs';

  const saveToFirestore = async (
    newData: {
      advisors: AdvisorData[],
      totals?: any,
      reportStartDate?: string,
      reportEndDate?: string,
      advisorMix?: AdvisorMixRow[],
      payTypes?: unknown,
    },
    overwrite = false,
    targetMonthOverride?: string
  ): Promise<{ advisorCount: number; skippedCount: number; targetMonth: string; advisors: AdvisorData[]; totals?: any }> => {
    if (!user || !currentDealershipId) {
      throw new Error('You must be signed in with a dealership selected to save performance data.');
    }
    
    let updatedAdvisors: AdvisorData[] = [];
    const incomingCount = newData.advisors?.length ?? 0;

    const acceptAdvisor = (name: string): boolean => {
      if (!isRealAdvisorName(name, effectiveDmsProvider)) return false;
      if (effectiveDmsProvider === 'dealerbuilt' && isPhantomPbsAdvisorName(name)) return false;
      if (!matchesPerformanceAdvisorRoster(name, effectiveAdvisorRoster)) return false;
      return true;
    };

    const normalizeName = (rawName: string) => cleanAdvisorName(rawName, effectiveDmsProvider);

    let acceptedIncoming = 0;

    if (overwrite) {
      updatedAdvisors = newData.advisors
        .filter((a) => {
          if (!acceptAdvisor(a.name)) return false;
          acceptedIncoming += 1;
          return true;
        })
        .map((a) => ({ ...a, name: normalizeName(a.name) }));
    } else {
      updatedAdvisors = [...advisors]
        .filter((a) => acceptAdvisor(a.name))
        .map((a) => ({ ...a, name: normalizeName(a.name) }));

      newData.advisors.forEach((newAdvisor) => {
        if (!acceptAdvisor(newAdvisor.name)) return;
        acceptedIncoming += 1;
        const normalizedName = normalizeName(newAdvisor.name);

        const idx = updatedAdvisors.findIndex(a => a.name.toLowerCase().trim() === normalizedName.toLowerCase().trim());
        
        if (idx !== -1) {
          // Merge into existing advisor record
          updatedAdvisors[idx] = {
            ...updatedAdvisors[idx],
            name: normalizedName,
            ...(newAdvisor.laborSold !== undefined && { laborSold: newAdvisor.laborSold }),
            ...(newAdvisor.grossLabor !== undefined && { grossLabor: newAdvisor.grossLabor }),
            ...(newAdvisor.partsSold !== undefined && { partsSold: newAdvisor.partsSold }),
            ...(newAdvisor.grossParts !== undefined && { grossParts: newAdvisor.grossParts }),
            ...(newAdvisor.soCount !== undefined && { soCount: newAdvisor.soCount }),
            ...(newAdvisor.totalSales !== undefined && { totalSales: newAdvisor.totalSales }),
            ...(newAdvisor.hrsSold !== undefined && { hrsSold: newAdvisor.hrsSold }),
            ...(newAdvisor.elr !== undefined && { elr: newAdvisor.elr }),
            ...(newAdvisor.gpPercent !== undefined && { gpPercent: newAdvisor.gpPercent }),
            ...(newAdvisor.upsells && { upsells: newAdvisor.upsells }),
            ...(newAdvisor.upsellCount !== undefined && { upsellCount: newAdvisor.upsellCount })
          };
        } else {
          // Create new advisor record
          updatedAdvisors.push({
            ...newAdvisor,
            name: normalizedName
          });
        }
      });
    }

    const targetMonth = targetMonthOverride || selectedMonth;
    const docId = performanceDocId('advisorReports', currentDealershipId, targetMonth);
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);

    const skippedCount = Math.max(0, incomingCount - acceptedIncoming);
    if (incomingCount > 0 && acceptedIncoming === 0) {
      const parsedNames = (newData.advisors ?? []).map((a) => a.name).join(', ');
      const phantomPbsOnly = (newData.advisors ?? []).every((a) =>
        isPhantomPbsAdvisorName(a.name)
      );
      let rosterHint = '';
      if (phantomPbsOnly && effectiveDmsProvider === 'dealerbuilt') {
        rosterHint =
          ' The parser returned legacy PBS demo names (Frank/Lemmy), not your Ford advisors. Restart the app with `npm run dev` (not an old server process), confirm OPENAI_API_KEY is set, and verify Admin → DMS → DealerBuilt.';
      } else if (effectiveAdvisorRoster.length > 0) {
        rosterHint = ` None of the ${incomingCount} parsed advisor(s) matched your configured roster (${parsedNames}). Check Admin → DMS = DealerBuilt and the productivity advisor list.`;
      } else {
        rosterHint = ` All parsed advisors were rejected by validation rules (${parsedNames}).`;
      }
      throw new Error(`Import parsed ${incomingCount} advisor(s) but none could be saved.${rosterHint}`);
    }
    
    const mixRows = newData.advisorMix ?? computeAdvisorMix(updatedAdvisors);

    try {
      await setDoc(docRef, {
        dealershipId: currentDealershipId,
        advisors: updatedAdvisors,
        ...(newData.totals && { totals: newData.totals }),
        ...(newData.reportStartDate && { reportStartDate: newData.reportStartDate }),
        ...(newData.reportEndDate && { reportEndDate: newData.reportEndDate }),
        ...(newData.payTypes && { payTypes: newData.payTypes }),
        advisorMix: mixRows,
        source: isPbsDealership ? 'csr-pdf' : 'dms-pdf',
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: false }); // Disable automatic merge to cleanly replace any junk advisors
    } catch (error) {
      console.error('Error saving advisor performance:', error);
      throw error instanceof Error ? error : new Error('Failed to save performance data to Firestore.');
    }

    return {
      advisorCount: updatedAdvisors.length,
      skippedCount,
      targetMonth,
      advisors: updatedAdvisors,
      totals: newData.totals,
    };
  };

  const resetPerformanceToDefaults = async () => {
    if (!user || !currentDealershipId) return;

    setLoading(true);

    const advisorDocId = performanceDocId('advisorReports', currentDealershipId, selectedMonth);
    const techDocId = performanceDocId('technicianReports', currentDealershipId, selectedMonth);
    const advisorRef = doc(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'performance',
      advisorDocId
    );
    const techRef = doc(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'performance',
      techDocId
    );

    try {
      const activeRange = getActiveMonthDateRange();
      await setDoc(advisorRef, {
        advisors: [],
        totals: EMPTY_PERFORMANCE_TOTALS,
        reportStartDate: selectedMonth === 'active' ? activeRange.start : undefined,
        reportEndDate: selectedMonth === 'active' ? activeRange.end : undefined,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });

      await setDoc(techRef, {
        technicians: [],
        reportStartDate: selectedMonth === 'active' ? activeRange.start : undefined,
        reportEndDate: selectedMonth === 'active' ? activeRange.end : undefined,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });

      setImportStatus({
        type: 'success',
        message:
          selectedMonth === 'active'
            ? 'Reset complete. Run Pull changes in Admin → PBS Sync to repopulate July advisor and technician data.'
            : `Reset complete for ${formatArchiveMonthLabel(selectedMonth)} archive. PBS pull only repopulates the active month.`,
      });
    } catch (error: any) {
      console.error('Error resetting performance database:', error);
      setImportStatus({ type: 'error', message: 'Failed to reset database.' });
    } finally {
      setLoading(false);
    }
  };


  // Calculate totals and projections
  const getPerformanceMetrics = () => {
    const resolved = resolvePerformanceTotalsFromDoc(
      {
        advisors: visibleAdvisors,
        totals,
        reportStartDate,
        reportEndDate,
      },
      { advisorSubset: visibleAdvisors.length < advisors.length }
    );
    const baseTotals = resolved
      ? {
          totalGross: resolved.totalGross,
          totalLabor: resolved.totalLabor,
          totalParts: resolved.totalParts,
          totalGrossParts: resolved.totalGrossParts,
          totalSales: resolved.totalSales,
          totalHrs: resolved.totalHrs,
        }
      : null;

    if (!baseTotals) return null;

    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const paceDays = reportEndDate
      ? Math.max(1, workingDaysThroughIsoDate(reportEndDate, today))
      : Math.max(1, today.getDate());
    
    // Pace/Forecast calculation (working days through report end when available)
    const avgDailyGross = (baseTotals.totalGross || 0) / paceDays;
    const grossForecast = Math.round(avgDailyGross * daysInMonth);
    
    const avgDailySales = (baseTotals.totalSales || 0) / paceDays;
    const salesForecast = Math.round(avgDailySales * daysInMonth);

    const avgDailyParts = (baseTotals.totalParts || 0) / paceDays;
    const partsForecast = Math.round(avgDailyParts * daysInMonth);

    const avgDailyGrossParts = (baseTotals.totalGrossParts || 0) / paceDays;
    const grossPartsForecast = Math.round(avgDailyGrossParts * daysInMonth);

    return {
      ...baseTotals,
      grossForecast,
      salesForecast,
      partsForecast,
      grossPartsForecast,
      daysInMonth,
      elapsedDays: paceDays,
      daysRemaining: daysInMonth - today.getDate()
    };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <KpiStripSkeleton count={5} />
        <TableSkeleton rows={6} cols={5} />
      </div>
    );
  }

  const metrics = getPerformanceMetrics();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="crm-section-title flex items-center gap-2">
            <Users size={18} className="text-brand-secondary" />
            Advisor performance
          </h3>
          <p className="crm-label mt-1">
            {isPbsDealership
              ? 'Labor, parts, and gross totals from PBS cashiered ROs (current month).'
              : 'Labor, parts, and gross totals from productivity imports.'}
          </p>
          {selectedMonth !== 'active' && (
            <p className="text-[10px] text-amber-400/90 mt-1 font-medium">
              Viewing saved archive — PBS pull only updates the active month. Switch View Period to July (Active).
            </p>
          )}
          {selectedMonth === 'active' && reportStartDate && reportEndDate && (
            <p className="crm-label text-[10px] mt-1">
              Active period: {reportStartDate} – {reportEndDate}
              {pbsSyncedAt ? ` · PBS synced ${new Date(pbsSyncedAt).toLocaleString()}` : ''}
            </p>
          )}
          {isPbsDealership && partsInvoicesSkipped && selectedMonth === 'active' && (
            <p className="text-[10px] text-amber-400/90 mt-2 max-w-2xl leading-relaxed">
              Parts totals are incomplete — PBS denied access to cashiered parts invoices
              {partsInvoicesSkipReason ? ` (${partsInvoicesSkipReason})` : ''}. Counter/walk-in parts
              are not included. Ask PBS/PartnerHUB to enable <strong className="text-amber-200">PartsInvoiceGet</strong> if
              you need parts accuracy.
            </p>
          )}
          {isPbsDealership && performanceSource === 'pbs-sync' && selectedMonth === 'active' && unmatchedAdvisorNames.length > 0 && (
            <p className="text-[10px] text-amber-400/90 mt-2 max-w-2xl leading-relaxed">
              PBS attributed labor to advisor names not on your performance roster:{' '}
              <strong className="text-amber-200">{unmatchedAdvisorNames.join(', ')}</strong>. Their
              cards are hidden. Map PBS login codes under{' '}
              <strong className="text-amber-200">Manager → Operations settings → PBS login code map</strong>,
              or add the advisor to your roster there, then run{' '}
              <strong className="text-amber-200">Admin → PBS Sync → Pull changes</strong>.
            </p>
          )}
          {isPbsDealership && performanceSource === 'csr-pdf' && selectedMonth === 'active' && (
            <p className="text-[10px] text-emerald-400/90 mt-2 max-w-2xl leading-relaxed">
              Labor gross is from a manually entered CSR productivity report (matches PBS). Pull changes will
              refresh advisor rows but keep that labor gross until you update it via Manual Entry.
            </p>
          )}
          {isPbsDealership && performanceSource === 'pbs-sync' && selectedMonth === 'active' && (
            <p className="crm-label text-[10px] mt-2 max-w-2xl leading-relaxed">
              Labor gross is computed from cashiered repair orders via PBS. For an exact match to the CSR
              productivity report, use Manual Entry — PBS has no dedicated productivity report API.
            </p>
          )}
        </div>
        
        {selectedMonth !== 'active' && !allowArchiveEditing ? (
          <div className="card-base flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
              🔒 VIEWING HISTORY ARCHIVE ({formatArchiveDisplayLabel(selectedMonth)} - READ ONLY)
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 w-full md:flex md:flex-wrap md:items-center md:gap-2.5 md:w-auto">
            {selectedMonth !== 'active' && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse md:flex-initial">
                <span>⚠️ ARCHIVE EDIT MODE ({selectedMonth})</span>
              </div>
            )}

            <button 
              type="button"
              onClick={() => {
                if (!showResetConfirm) {
                  setShowResetConfirm(true);
                  setTimeout(() => setShowResetConfirm(false), 4000);
                } else {
                  resetPerformanceToDefaults();
                  setShowResetConfirm(false);
                }
              }}
              className={cn(
                "w-full md:w-auto flex items-center justify-center gap-2 px-4 py-3 md:px-3 md:py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-lg cursor-pointer touch-manipulation min-h-[44px]",
                showResetConfirm
                  ? "bg-rose-950/40 text-rose-400 border-rose-500/30 animate-pulse"
                  : "btn-secondary hover:text-rose-400"
              )}
              title="Clear all advisors and technicians for this view period"
            >
              <RotateCcw size={14} className={cn("shrink-0", showResetConfirm ? "animate-spin" : "")} />
              {showResetConfirm ? "Confirm Reset?" : "Reset Data"}
            </button>

            <button 
              onClick={() => setIsManualEntryOpen(true)}
              className="btn-secondary w-full md:w-auto px-4 py-3 md:py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg cursor-pointer touch-manipulation min-h-[44px] hover:opacity-80"
            >
              <Keyboard size={14} className="shrink-0" />
              Manual Entry
            </button>
          </div>
        )}
      </div>

      <ManualPerformanceEntry 
        isOpen={isManualEntryOpen}
        onClose={() => setIsManualEntryOpen(false)}
        initialAdvisors={advisors}
        onSave={async (data) => {
          await saveToFirestore(data, true);
          setImportStatus({ type: 'success', message: 'Manual productivity data saved successfully!' });
        }}
      />


      <AnimatePresence>
        {importStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              "p-3 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center gap-3",
              importStatus.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-rose-500/10 border-rose-500/20 text-rose-500"
            )}
          >
            {importStatus.type === 'success' ? <CheckCircle2 size={14} /> : <X size={14} />}
            {importStatus.message}
            <button onClick={() => setImportStatus(null)} className="ml-auto opacity-50 hover:opacity-100">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!visibleAdvisors.length && (
        <EmptyState
          title={isPbsDealership ? 'No advisor data for this period' : 'No productivity data yet'}
          description={
            isPbsDealership
              ? selectedMonth !== 'active'
                ? 'PBS sync writes to the active month only. Set View Period to the current month, then run Pull changes in Admin → PBS Sync.'
                : performanceSource === 'pbs-sync' && pbsSyncedAt
                  ? `PBS pulled on ${new Date(pbsSyncedAt).toLocaleString()} but returned 0 advisors for ${reportStartDate || 'this month'}. Check Admin → PBS Sync log for Perf advisors and Cashiered ROs — both should be > 0.`
                  : 'Run Pull changes in Admin → PBS Sync to load July cashiered RO totals for Frank, Lemmy, and Jaryn.'
              : 'Use Manual Entry to add advisor labor, parts, and gross totals for this month.'
          }
          action={
            !isPbsDealership ? (
              <button type="button" onClick={() => setIsManualEntryOpen(true)} className="btn-primary">
                Manual Entry
              </button>
            ) : undefined
          }
        />
      )}

      <AnimatePresence>
        {visibleAdvisors.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {metrics && (
              <KpiStrip
                columns={5}
                tiles={[
                  {
                    label: 'Labor sales MTD',
                    value: `$${metrics.totalLabor.toLocaleString()}`,
                    sublabel: 'Daily avg',
                    subvalue: `$${(metrics.totalLabor / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/d`,
                  },
                  {
                    label: 'Labor gross MTD',
                    value: `$${metrics.totalGross.toLocaleString()}`,
                    sublabel: 'GP',
                    subvalue: `${Math.round((metrics.totalGross / (metrics.totalLabor || 1)) * 100)}%`,
                    tone: 'info',
                  },
                  {
                    label: 'Parts sales MTD',
                    value: `$${(metrics.totalParts || 0).toLocaleString()}`,
                    sublabel: 'Daily avg',
                    subvalue: `$${((metrics.totalParts || 0) / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/d`,
                  },
                  {
                    label: 'Parts gross MTD',
                    value: `$${(metrics.totalGrossParts || 0).toLocaleString()}`,
                    sublabel: 'GP',
                    subvalue: `${Math.round(((metrics.totalGrossParts || 0) / (metrics.totalParts || 1)) * 100)}%`,
                    tone: 'success',
                  },
                  {
                    label: 'Store throughput',
                    value: `$${metrics.totalSales.toLocaleString()}`,
                    sublabel: 'Forecast pace',
                    subvalue: `$${metrics.salesForecast.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                    tone: 'info',
                  },
                ]}
              />
            )}



            {/* Advisor Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {visibleAdvisors.map((advisor, idx) => (
                <div key={idx} className="card-base group flex flex-col rounded-3xl overflow-hidden transition-all hover:shadow-2xl hover:shadow-slate-900/10 dark:hover:shadow-black/50">
                  <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-muted)' }}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black border shadow-inner" style={{ backgroundColor: 'var(--color-surface-card)', color: 'var(--color-text-primary)', borderColor: 'var(--color-surface-border)' }}>
                        {advisor.name[0]}
                      </div>
                      <div>
                        <h4 className="font-black uppercase tracking-tighter text-lg leading-none" style={{ color: 'var(--color-text-primary)' }}>{advisor.name}</h4>
                        <p className="crm-label text-[9px] font-bold uppercase mt-1 tracking-widest">Service Advisor</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-5 flex-1">
                    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:gap-6">
                      <div className="p-3 md:p-4 rounded-2xl border relative overflow-hidden" style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-surface-border)' }}>
                        <div className="absolute top-0 right-0 p-2 opacity-10"><DollarSign size={20} /></div>
                        <p className="crm-label text-[9px] font-black uppercase mb-1">Labor Sales</p>
                        <p className="text-base md:text-lg font-black leading-none tracking-tighter" style={{ color: 'var(--color-text-primary)' }}>${advisor.laborSold.toLocaleString()}</p>
                      </div>
                      <div className="p-3 md:p-4 bg-brand-secondary/5 rounded-2xl border border-brand-secondary/10 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-2 opacity-10 text-brand-secondary"><TrendingUp size={20} /></div>
                        <p className="text-[9px] font-black text-brand-secondary uppercase mb-1">Gross Labor</p>
                        <p className="text-base md:text-lg font-black leading-none tracking-tighter" style={{ color: 'var(--color-text-primary)' }}>${advisor.grossLabor.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                       <div className="flex justify-between items-end">
                         <div className="flex items-center gap-1.5">
                            <Target size={12} className="text-slate-400 dark:text-slate-600" />
                            <p className="crm-label text-[10px] font-black uppercase tracking-widest">Labor Gross Profit</p>
                         </div>
                         <p className="text-sm font-black" style={{ color: 'var(--color-text-primary)' }}>{Math.round((advisor.grossLabor / (advisor.laborSold || 1)) * 100)}% GP</p>
                       </div>
                       <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
                         <div className={cn(
                           "h-full transition-all duration-1000 shadow-[0_0_8px_rgba(var(--brand-primary-rgb),0.5)]",
                           (advisor.grossLabor / (advisor.laborSold || 1)) > 0.8 ? "bg-emerald-500" : (advisor.grossLabor / (advisor.laborSold || 1)) > 0.7 ? "bg-brand-primary" : "bg-rose-500"
                         )} style={{ width: `${Math.round((advisor.grossLabor / (advisor.laborSold || 1)) * 100)}%` }}></div>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3">
                         <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface-muted)' }}><Clock size={14} className="text-slate-400" /></div>
                         <div>
                            <p className="crm-label text-[10px] font-bold uppercase">Hours</p>
                            <p className="text-sm font-black" style={{ color: 'var(--color-text-primary)' }}>{advisor.hrsSold.toFixed(1)}</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-surface-muted)' }}><DollarSign size={14} className="text-slate-400" /></div>
                         <div>
                            <p className="crm-label text-[10px] font-bold uppercase">Avg E.L.R.</p>
                            <p className="text-sm font-black text-brand-secondary">${advisor.elr}</p>
                         </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-4 border-t flex items-center justify-between" style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-surface-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="crm-label text-[10px] font-black uppercase tracking-widest">Repair Orders:</span>
                      <span className="text-xs font-black" style={{ color: 'var(--color-text-primary)' }}>{advisor.soCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 rounded-full">
                       <CheckCircle2 size={10} className="text-emerald-500" />
                       <span className="text-[9px] font-black text-emerald-500 uppercase">Verified</span>
                    </div>
                  </div>

                  <div className="px-6 py-4 border-t" style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-surface-border)' }}>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 bg-brand-primary/10 rounded-lg">
                        <Target size={14} className="text-brand-primary" />
                      </div>
                      <span className="crm-label text-[10px] font-black uppercase tracking-widest">
                        Service Frequency / Upsells
                      </span>
                    </div>

                    <div className="space-y-2">
                      {advisor.upsells?.map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-xl border transition-colors" style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[8px] font-black border" style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-secondary)', borderColor: 'var(--color-surface-border)' }}>
                              {item.code}
                            </div>
                            <div>
                              <p className="text-[10px] font-black leading-none mb-1" style={{ color: 'var(--color-text-primary)' }}>
                                {item.code === 'FB' || (item.description.toUpperCase().includes('FRONT BRAKE') && item.description.toUpperCase().includes('RESURFACE'))
                                  ? 'FB PAD R&R ROTOR RESURFACE'
                                  : item.code === 'RB' || (item.description.toUpperCase().includes('REAR BRAKE') && item.description.toUpperCase().includes('RESURFACE'))
                                  ? 'RB PAD R&R ROTOR RESURFACE'
                                  : item.description}
                              </p>
                              <p className="text-[8px] font-bold text-brand-secondary uppercase tracking-tighter">Labor: ${item.revenue.toFixed(2)}</p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 whitespace-nowrap">
                              <span className="text-xs">{item.count}</span>
                              <span className="opacity-70 uppercase text-[8px]">Sold</span>
                            </span>
                          </div>
                        </div>
                      ))}
                      {(!advisor.upsells || advisor.upsells.length === 0) && (
                        (advisor.upsellCount ?? 0) > 0 ? (
                          <div className="flex items-center justify-between p-2.5 rounded-xl border" style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}>
                            <span className="crm-label text-[10px] font-black uppercase tracking-widest">Upsells (manual entry)</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 whitespace-nowrap">
                              <span className="text-xs">{advisor.upsellCount}</span>
                              <span className="opacity-70 uppercase text-[8px]">Sold</span>
                            </span>
                          </div>
                        ) : (
                          <p className="crm-label text-center py-4 text-[10px] font-bold uppercase tracking-widest italic">No upsell data available</p>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
