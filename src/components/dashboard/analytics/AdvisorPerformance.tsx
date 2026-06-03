import React, { useState, useEffect } from 'react';
import { 
  FileUp, TrendingUp, Users, DollarSign, Clock, Loader2, CheckCircle2, ChevronRight, BarChart3, Target, ChevronDown, X, Keyboard, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import { extractTextFromPDF } from '../../../utils/pdfExtractor';
import { ManualPerformanceEntry } from './ManualPerformanceEntry';
import {
  EMPTY_PERFORMANCE_TOTALS,
  performanceDocId,
} from '../../../lib/operationsViewPeriod';
import { withDmsProvider } from '../../../lib/reportIngestion';
import type { DmsProviderId } from '../../../constants/dmsProviders';
import { normalizeDmsProvider } from '../../../constants/dmsProviders';
import {
  defaultDmsProviderForDealership,
  defaultPerformanceAdvisorRoster,
} from '../../../constants/dealerDefaults';
import {
  cleanAdvisorName,
  isPhantomPbsAdvisorName,
  isRealAdvisorName,
  matchesPerformanceAdvisorRoster,
} from '../../../lib/advisorNameUtils';
import type { PerformanceAdvisorSlot } from '../../../types';
import {
  computeAdvisorMix,
  extractOperationsPayTypes,
  type AdvisorMixRow,
  type OperationsPayTypeSummary,
} from '../../../lib/operationsPayTypes';

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
}

interface AdvisorPerformanceProps {
  currentDealershipId: string;
  selectedMonth?: string;
  allowArchiveEditing?: boolean;
}

export const AdvisorPerformance: React.FC<AdvisorPerformanceProps> = ({ currentDealershipId, selectedMonth = 'active', allowArchiveEditing = false }) => {
  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [expandedAdvisors, setExpandedAdvisors] = useState<Record<string, boolean>>({});
  const [advisors, setAdvisors] = useState<AdvisorData[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [payTypes, setPayTypes] = useState<OperationsPayTypeSummary | null>(null);
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
          const hasJay = data.advisors.some((a: any) => a.name.toLowerCase().trim() === 'jay');
          const filtered = data.advisors.filter((a: any) => a.name.toLowerCase().trim() !== 'jay');
          setAdvisors(filtered);
          
          if (hasJay) {
            console.log("Automatically purging Jay from advisor records...");
            saveToFirestore({ advisors: filtered, totals: data.totals }, true);
          }
        } else {
          setAdvisors([]);
        }
        if (data.totals) setTotals(data.totals);
        if (data.payTypes) setPayTypes(data.payTypes as OperationsPayTypeSummary);
        else setPayTypes(null);
        if (data.advisorMix?.length) setAdvisorMix(data.advisorMix as AdvisorMixRow[]);
        else if (data.advisors?.length) setAdvisorMix(computeAdvisorMix(data.advisors));
        else setAdvisorMix([]);
      } else {
        setAdvisors([]);
        setTotals(null);
        setPayTypes(null);
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

  const saveToFirestore = async (
    newData: { advisors: AdvisorData[], totals?: any, reportStartDate?: string, reportEndDate?: string }, 
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

    if (overwrite) {
      updatedAdvisors = newData.advisors
        .filter((a) => acceptAdvisor(a.name))
        .map((a) => ({ ...a, name: normalizeName(a.name) }));
    } else {
      updatedAdvisors = [...advisors]
        .filter((a) => acceptAdvisor(a.name))
        .map((a) => ({ ...a, name: normalizeName(a.name) }));

      newData.advisors.forEach((newAdvisor) => {
        if (!acceptAdvisor(newAdvisor.name)) return;
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
            ...(newAdvisor.upsells && { upsells: newAdvisor.upsells })
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

    const skippedCount = Math.max(0, incomingCount - updatedAdvisors.length);
    if (incomingCount > 0 && updatedAdvisors.length === 0) {
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
        advisors: updatedAdvisors,
        ...(newData.totals && { totals: newData.totals }),
        ...(newData.reportStartDate && { reportStartDate: newData.reportStartDate }),
        ...(newData.reportEndDate && { reportEndDate: newData.reportEndDate }),
        ...(newData.payTypes && { payTypes: newData.payTypes }),
        advisorMix: mixRows,
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
      await setDoc(advisorRef, {
        advisors: [],
        totals: EMPTY_PERFORMANCE_TOTALS,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });

      await setDoc(techRef, {
        technicians: [],
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });

      setImportStatus({
        type: 'success',
        message: 'Reset complete — 0 advisors and 0 technicians for this view period.',
      });
    } catch (error: any) {
      console.error('Error resetting performance database:', error);
      setImportStatus({ type: 'error', message: 'Failed to reset database.' });
    } finally {
      setLoading(false);
    }
  };


const IMPORT_PARSE_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out after ${Math.round(ms / 1000)}s. Ensure \`npm run dev\` is running and try again.`
            )
          ),
        ms
      )
    ),
  ]);
}

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


  const monthKeyFromIsoDate = (iso?: string | null): string | null => {
    if (!iso || !/^\d{4}-\d{2}/.test(iso)) return null;
    return iso.slice(0, 7);
  };

  /** When editing an archive month, always save to that month. */
  const resolveImportTargetMonth = (
    parsed: { reportStartDate?: string; reportEndDate?: string },
    reportText: string
  ): string => {
    if (selectedMonth !== 'active') return selectedMonth;
    const fromParsed =
      monthKeyFromIsoDate(parsed.reportStartDate) ||
      monthKeyFromIsoDate(parsed.reportEndDate);
    if (fromParsed) return fromParsed;
    const detected = detectDateRangeFromText(reportText);
    if (detected?.start) {
      const key = monthKeyFromIsoDate(detected.start);
      if (key) return key;
    }
    return selectedMonth;
  };

  const detectDateRangeFromText = (text: string): { start: string; end: string } | null => {
    if (!text) return null;
    const regexSlashRange = /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-\u2013\u2014to]+\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/;
    const slashMatch = text.match(regexSlashRange);
    if (slashMatch) {
      const parseFlexibleStr = (str: string): string => {
        const parts = str.split('/');
        let m = parseInt(parts[0], 10);
        let d = parseInt(parts[1], 10);
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        const mm = m < 10 ? `0${m}` : `${m}`;
        const dd = d < 10 ? `0${d}` : `${d}`;
        return `${y}-${mm}-${dd}`;
      };
      try {
        return {
          start: parseFlexibleStr(slashMatch[1]),
          end: parseFlexibleStr(slashMatch[2])
        };
      } catch (e) {
        console.warn("Slash range format parsed with error:", e);
      }
    }

    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const regexWordRange = /([a-zA-Z]+)\s+(\d{1,2})\s*,\s*(\d{4})\s*[-\u2013\u2014to]+\s*([a-zA-Z]+)\s+(\d{1,2})\s*,\s*(\d{4})/;
    const wordMatch = text.match(regexWordRange);
    if (wordMatch) {
      try {
        const getMonthIndex = (word: string): number => {
          const needle = word.toLowerCase().slice(0, 3);
          const idx = months.indexOf(needle);
          return idx !== -1 ? idx : 0;
        };
        const startM = getMonthIndex(wordMatch[1]) + 1;
        const startD = parseInt(wordMatch[2], 10);
        const startY = parseInt(wordMatch[3], 10);
        
        const endM = getMonthIndex(wordMatch[4]) + 1;
        const endD = parseInt(wordMatch[5], 10);
        const endY = parseInt(wordMatch[6], 10);

        const mmStart = startM < 10 ? `0${startM}` : `${startM}`;
        const ddStart = startD < 10 ? `0${startD}` : `${startD}`;
        const mmEnd = endM < 10 ? `0${endM}` : `${endM}`;
        const ddEnd = endD < 10 ? `0${endD}` : `${endD}`;

        return {
          start: `${startY}-${mmStart}-${ddStart}`,
          end: `${endY}-${mmEnd}-${ddEnd}`
        };
      } catch (e) {
        console.warn("Word range format parsed with error:", e);
      }
    }
    return null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus(null);
    setImportProgress(null);

    const isDealerBuiltImport = effectiveDmsProvider === 'dealerbuilt';

    try {
      let reportText = '';
      let payload: { reportText: string; pdfBase64?: string };

      if (isDealerBuiltImport) {
        // Scanned DealerBuilt PDFs: skip slow in-browser pdf.js — server uses OCR + vision.
        setImportProgress('Uploading PDF for server-side parsing (scanned reports may take 1–3 min)...');
        payload = {
          reportText: '',
          pdfBase64: await withTimeout(fileToBase64(file), 90_000, 'PDF upload'),
        };
      } else {
        setImportProgress('Reading PDF text...');
        try {
          reportText = await withTimeout(extractTextFromPDF(file), 20_000, 'PDF text read');
        } catch (extractErr) {
          console.warn('PDF text extraction skipped or timed out; will use server-side parsing:', extractErr);
        }

        payload = { reportText };
        const hasMinimalText =
          !reportText || reportText.replace(/\s+/g, ' ').trim().length < 80;
        const looksDealerBuilt =
          /service advisor performance|ro svc wrtr/i.test(reportText);

        if (hasMinimalText || looksDealerBuilt) {
          setImportProgress('Uploading PDF for server-side OCR/vision...');
          payload.pdfBase64 = await withTimeout(fileToBase64(file), 90_000, 'PDF upload');
        }

        if (hasMinimalText || looksDealerBuilt) {
          console.warn(
            'Scanned or DealerBuilt-style PDF detected. Set Admin → DMS Configuration → DealerBuilt for Ford reports.'
          );
        }
      }

      setImportProgress('Parsing on server (please wait — do not close this tab)...');
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), IMPORT_PARSE_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch('/api/parse-performance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withDmsProvider({ dmsProvider: effectiveDmsProvider, dealershipId: currentDealershipId }, payload)),
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        if (fetchErr?.name === 'AbortError') {
          throw new Error(
            'Import timed out after 5 minutes. Confirm OPENAI_API_KEY is set in .env.local, restart `npm run dev`, and retry.'
          );
        }
        throw new Error(
          fetchErr?.message ||
            'Could not reach /api/parse-performance. Start the app with `npm run dev` (not vite alone).'
        );
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!response.ok) {
        let errorMessage = 'Failed to analyze report';
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            errorMessage = `Server Error (${response.status}): Malformed error response.`;
          }
        } else {
          // Response is HTML or plain text
          const text = await response.text();
          console.error('Server returned non-JSON error:', text.substring(0, 200));
          errorMessage = `Server Error (${response.status}): ${response.statusText}.`;
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error('Failed to parse successful response as JSON:', e);
        throw new Error('Server returned an invalid data format. Please try again.');
      }
      
      const detectedDates = detectDateRangeFromText(reportText);
      if (detectedDates && !data.reportStartDate) {
        data = {
          ...data,
          reportStartDate: detectedDates.start,
          reportEndDate: detectedDates.end,
        };
      }

      const targetMonth = resolveImportTargetMonth(data, reportText);

      if (!data.advisors?.length) {
        throw new Error(
          'OpenAI did not return any advisors for this report. Confirm DMS is set to DealerBuilt (Ford) in Admin → Operations and retry.'
        );
      }

      const shouldOverwrite = !!data.totals;
      const extractedPayTypes = extractOperationsPayTypes(reportText);
      setImportProgress('Saving imported data...');
      const saved = await saveToFirestore({ ...data, payTypes: extractedPayTypes ?? data.payTypes ?? null }, shouldOverwrite, targetMonth);

      if (saved.advisorCount === 0) {
        throw new Error('Nothing was saved — no valid advisor rows after validation.');
      }

      // Refresh UI immediately (don't wait for Firestore listener)
      setAdvisors(saved.advisors);
      if (saved.totals) setTotals(saved.totals);
      if (extractedPayTypes) setPayTypes(extractedPayTypes);

      const hasUpsells = data.advisors.some((a: any) => a.upsells && a.upsells.length > 0);
      const hasTotals = !!data.totals;
      const archiveLabel =
        targetMonth !== 'active'
          ? targetMonth === '2026-05'
            ? 'May 2026 archive'
            : `${targetMonth} archive`
          : 'active month';

      let message = `Saved ${saved.advisorCount} advisor(s) to ${archiveLabel}.`;
      if (saved.skippedCount > 0) {
        message += ` (${saved.skippedCount} row(s) skipped — not on roster)`;
      }
      if (targetMonth !== selectedMonth && selectedMonth === 'active') {
        message += ' Switch the month selector to view the archive you just updated.';
      } else if (hasUpsells && hasTotals) {
        message = `Productivity + upsell data saved to ${archiveLabel} (${saved.advisorCount} advisors).`;
      } else if (hasTotals) {
        message = `Productivity data saved to ${archiveLabel} (${saved.advisorCount} advisors).`;
      }

      setImportStatus({ type: 'success', message });
      
    } catch (error: any) {
      console.error('Performance Import Error:', error);
      setImportStatus({ type: 'error', message: error.message || 'Error importing PDF. Please try again.' });
    } finally {
      setIsImporting(false);
      setImportProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Calculate totals and projections
  const getPerformanceMetrics = () => {
    let baseTotals = totals;
    
    // Always compute or check based on the sum of advisors if advisors exist
    if (advisors.length > 0) {
      const computedGross = advisors.reduce((a, b) => a + (Number(b.grossLabor) || 0), 0);
      const computedLabor = advisors.reduce((a, b) => a + (Number(b.laborSold) || 0), 0);
      const computedParts = advisors.reduce((a, b) => a + (Number(b.partsSold) || 0), 0);
      const computedGrossParts = advisors.reduce((a, b) => a + (Number(b.grossParts) || 0), 0);
      const computedSales = computedLabor + computedParts;
      const computedHrs = advisors.reduce((a, b) => a + (Number(b.hrsSold) || 0), 0);

      // Reconcile and override baseTotals if missing, or if sum of advisors is higher or different due to partial category extraction (e.g. Customer Labor C instead of Total)
      if (!baseTotals || Math.abs(baseTotals.totalGross - computedGross) > 10.0 || Math.abs(baseTotals.totalLabor - computedLabor) > 10.0 || computedGross > baseTotals.totalGross) {
        baseTotals = {
          totalGross: computedGross,
          totalLabor: computedLabor,
          totalParts: computedParts,
          totalGrossParts: computedGrossParts,
          totalSales: computedSales,
          totalHrs: computedHrs,
        };
      } else {
        // Even if baseTotals exists, verify totalSales is indeed Labor + Parts
        baseTotals.totalSales = (Number(baseTotals.totalLabor) || 0) + (Number(baseTotals.totalParts) || 0);
      }
    }

    if (!baseTotals) return null;

    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const elapsedDays = today.getDate();
    
    // Pace/Forecast calculation
    const avgDailyGross = (baseTotals.totalGross || 0) / Math.max(1, elapsedDays);
    const grossForecast = Math.round(avgDailyGross * daysInMonth);
    
    const avgDailySales = (baseTotals.totalSales || 0) / Math.max(1, elapsedDays);
    const salesForecast = Math.round(avgDailySales * daysInMonth);

    const avgDailyParts = (baseTotals.totalParts || 0) / Math.max(1, elapsedDays);
    const partsForecast = Math.round(avgDailyParts * daysInMonth);

    const avgDailyGrossParts = (baseTotals.totalGrossParts || 0) / Math.max(1, elapsedDays);
    const grossPartsForecast = Math.round(avgDailyGrossParts * daysInMonth);

    return {
      ...baseTotals,
      grossForecast,
      salesForecast,
      partsForecast,
      grossPartsForecast,
      daysInMonth,
      elapsedDays,
      daysRemaining: daysInMonth - elapsedDays
    };
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <Loader2 className="animate-spin text-brand-secondary" size={32} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Syncing Performance Dashboard...</p>
      </div>
    );
  }

  const metrics = getPerformanceMetrics();

  return (
    <div className="space-y-6">
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pdf"
        className="hidden"
      />
      
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-brand-secondary" />
            Advisor Performance Tracking
          </h3>
        </div>
        
        {selectedMonth !== 'active' && !allowArchiveEditing ? (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-white/5 rounded-xl shadow-lg">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
              🔒 VIEWING HISTORY ARCHIVE ({selectedMonth === '2026-05' ? 'MAY 2026' : selectedMonth === '2026-04' ? 'APRIL 2026' : selectedMonth.toUpperCase()} - READ ONLY)
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
                  : "bg-slate-800 text-slate-400 hover:text-rose-400 border-white/5"
              )}
              title="Clear all advisors and technicians for this view period"
            >
              <RotateCcw size={14} className={cn("shrink-0", showResetConfirm ? "animate-spin" : "")} />
              {showResetConfirm ? "Confirm Reset?" : "Reset Data"}
            </button>

            <button 
              onClick={() => setIsManualEntryOpen(true)}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 shadow-lg cursor-pointer touch-manipulation min-h-[44px]"
            >
              <Keyboard size={14} className="shrink-0" />
              Manual Entry
            </button>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 bg-brand-primary text-white hover:bg-brand-primary/90 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50 cursor-pointer touch-manipulation min-h-[44px]"
            >
              {isImporting ? <Loader2 size={14} className="animate-spin shrink-0" /> : <FileUp size={14} className="shrink-0" />}
              <span className="md:hidden">{isImporting ? "Importing..." : "Import PDF Report"}</span>
              <span className="hidden md:inline">{isImporting ? (importProgress ? "Importing..." : "Importing...") : "Import PDF Productivity Report"}</span>
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
        {isImporting && importProgress && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center gap-3 bg-sky-500/10 border-sky-500/20 text-sky-300"
          >
            <Loader2 size={14} className="animate-spin shrink-0" />
            {importProgress}
          </motion.div>
        )}
      </AnimatePresence>

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

      {!advisors.length && !isImporting && (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 rounded-3xl border-2 border-dashed border-slate-800/50">
          <BarChart3 size={48} className="text-slate-800 mb-4" />
          <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Awaiting PDF Data</p>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 text-brand-primary text-xs font-black uppercase tracking-widest hover:underline"
          >
            Click here to select file
          </button>
        </div>
      )}

      <AnimatePresence>
        {advisors.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Global Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Labor Sales MTD Box */}
              <div className="p-5 bg-[#0a0f1d]/65 border border-white/5 hover:border-white/10 rounded-2xl flex flex-col justify-between min-h-[110px] transition-all duration-300 shadow-lg">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Labor Sales MTD</p>
                  <p className="text-2xl font-black text-white leading-none tracking-tight">${metrics.totalLabor.toLocaleString()}</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between gap-2.5">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Daily Avg</span>
                  <span className="text-xs font-black text-slate-200">${(metrics.totalLabor / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, {maximumFractionDigits: 0})}/D</span>
                </div>
              </div>

              {/* Labor Gross Box */}
              <div className="p-5 bg-[#0a0f1d]/65 border border-white/5 hover:border-white/10 rounded-2xl flex flex-col justify-between min-h-[110px] transition-all duration-300 shadow-lg">
                <div>
                  <p className="text-[10px] font-black text-brand-secondary uppercase tracking-widest mb-1">Labor Gross MTD</p>
                  <p className="text-2xl font-black text-white leading-none tracking-tight">${metrics.totalGross.toLocaleString()}</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between gap-2.5">
                  <span className="text-[9px] font-black text-brand-secondary uppercase tracking-widest">{Math.round((metrics.totalGross / (metrics.totalLabor || 1)) * 100)}% GP</span>
                  <span className="text-xs font-black text-slate-200">${(metrics.totalGross / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, {maximumFractionDigits: 0})}/D</span>
                </div>
              </div>

              {/* Part Sales Box */}
              <div className="p-5 bg-[#0a0f1d]/65 border border-white/5 hover:border-white/10 rounded-2xl flex flex-col justify-between min-h-[110px] transition-all duration-300 shadow-lg">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Part Sales MTD</p>
                  <p className="text-2xl font-black text-white leading-none tracking-tight">${(metrics.totalParts || 0).toLocaleString()}</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between gap-2.5">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Daily Avg</span>
                  <span className="text-xs font-black text-slate-200">${((metrics.totalParts || 0) / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, {maximumFractionDigits: 0})}/D</span>
                </div>
              </div>

              {/* Parts Gross Box */}
              <div className="p-5 bg-[#0a0f1d]/65 border border-white/5 hover:border-white/10 rounded-2xl flex flex-col justify-between min-h-[110px] transition-all duration-300 shadow-lg">
                <div>
                  <p className="text-[10px] font-black text-emerald-550 uppercase tracking-widest mb-1">Parts Gross MTD</p>
                  <p className="text-2xl font-black text-white leading-none tracking-tight">${(metrics.totalGrossParts || 0).toLocaleString()}</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between gap-2.5">
                  <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{Math.round(((metrics.totalGrossParts || 0) / (metrics.totalParts || 1)) * 100)}% GP</span>
                  <span className="text-xs font-black text-emerald-400">${((metrics.totalGrossParts || 0) / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, {maximumFractionDigits: 0})}/D</span>
                </div>
              </div>

              {/* Store Throughput Box */}
              <div className="p-5 bg-gradient-to-br from-brand-primary/15 to-brand-primary/5 border border-brand-primary/20 hover:border-brand-primary/30 rounded-2xl flex flex-col justify-between min-h-[110px] transition-all duration-300 shadow-lg shadow-brand-primary/5">
                <div>
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Store Throughput</p>
                  <p className="text-2xl font-black text-white leading-none tracking-tight">${metrics.totalSales.toLocaleString()}</p>
                </div>
                <div className="mt-3 pt-2.5 border-brand-primary/10 border-t flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-[9px] font-black uppercase text-brand-primary/80">
                    <span>Pace</span>
                    <span className="text-emerald-450">${metrics.salesForecast.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-black">
                    <span className="text-[9px] text-slate-500 uppercase tracking-widest">Daily Avg</span>
                    <span className="text-slate-200">${(metrics.totalSales / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, {maximumFractionDigits: 0})}/D</span>
                  </div>
                </div>
              </div>
            </div>


            {(payTypes || advisorMix.length > 0) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {payTypes && (
                  <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">Pay Type Mix (RO)</h4>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                          Customer pay portion: <span className="text-brand-secondary">{payTypes.customerPayPortionPercent}%</span>
                        </p>
                      </div>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead><tr className="text-[9px] uppercase text-slate-500"><th className="py-2">Type</th><th className="text-right">ROs</th><th className="text-right">Mix</th><th className="text-right">ELR</th><th className="text-right">GP</th></tr></thead>
                      <tbody>
                        {([['Customer', payTypes.customer], ['Warranty', payTypes.warranty], ['Internal', payTypes.internal]] as const).map(([label, seg]) => (
                          <tr key={label} className="text-white border-t border-slate-800"><td className="py-2">{label}</td><td className="text-right font-mono">{seg.roCount}</td><td className="text-right font-mono text-brand-secondary">{seg.mixPercent}%</td><td className="text-right font-mono">${seg.elr.toFixed(2)}</td><td className="text-right font-mono">{seg.gpPercent}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {advisorMix.length > 0 && (
                  <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl space-y-4">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Advisor Derived Mix</h4>
                    {advisorMix.map((row) => (
                      <div key={row.name} className="space-y-1">
                        <div className="flex justify-between text-xs font-black text-white"><span>{row.name}</span><span className="text-brand-secondary">{row.mixPercent}%</span></div>
                        <div className="h-2 bg-slate-800 rounded-full"><div className="h-full bg-brand-primary rounded-full" style={{ width: `${Math.min(100, row.mixPercent)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Advisor Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {advisors.map((advisor, idx) => (
                <div key={idx} className="group flex flex-col bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden hover:border-slate-700 transition-all hover:shadow-2xl hover:shadow-black/50">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-sm font-black text-white border border-slate-700 shadow-inner">
                        {advisor.name[0]}
                      </div>
                      <div>
                        <h4 className="font-black text-white uppercase tracking-tighter text-lg leading-none">{advisor.name}</h4>
                        <p className="text-[9px] font-bold text-slate-500 uppercase mt-1 tracking-widest">Service Advisor</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-5 flex-1">
                    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:gap-6">
                      <div className="p-3 md:p-4 bg-slate-950/40 rounded-2xl border border-slate-800/50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10"><DollarSign size={20} /></div>
                        <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Labor Sales</p>
                        <p className="text-base md:text-lg font-black text-white leading-none tracking-tighter">${advisor.laborSold.toLocaleString()}</p>
                      </div>
                      <div className="p-3 md:p-4 bg-brand-secondary/5 rounded-2xl border border-brand-secondary/10 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-2 opacity-10 text-brand-secondary"><TrendingUp size={20} /></div>
                        <p className="text-[9px] font-black text-brand-secondary uppercase mb-1">Gross Labor</p>
                        <p className="text-base md:text-lg font-black text-white leading-none tracking-tighter">${advisor.grossLabor.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                       <div className="flex justify-between items-end">
                         <div className="flex items-center gap-1.5">
                            <Target size={12} className="text-slate-600" />
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Labor Gross Profit</p>
                         </div>
                         <p className="text-sm font-black text-white">{Math.round((advisor.grossLabor / (advisor.laborSold || 1)) * 100)}% GP</p>
                       </div>
                       <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                         <div className={cn(
                           "h-full transition-all duration-1000 shadow-[0_0_8px_rgba(var(--brand-primary-rgb),0.5)]",
                           (advisor.grossLabor / (advisor.laborSold || 1)) > 0.8 ? "bg-emerald-500" : (advisor.grossLabor / (advisor.laborSold || 1)) > 0.7 ? "bg-brand-primary" : "bg-rose-500"
                         )} style={{ width: `${Math.round((advisor.grossLabor / (advisor.laborSold || 1)) * 100)}%` }}></div>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3">
                         <div className="p-2 bg-slate-800/50 rounded-lg"><Clock size={14} className="text-slate-400" /></div>
                         <div>
                            <p className="text-[10px] font-bold text-slate-600 uppercase">Hours</p>
                            <p className="text-sm font-black text-white">{advisor.hrsSold.toFixed(1)}</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="p-2 bg-slate-800/50 rounded-lg"><DollarSign size={14} className="text-slate-400" /></div>
                         <div>
                            <p className="text-[10px] font-bold text-slate-600 uppercase">Avg E.L.R.</p>
                            <p className="text-sm font-black text-brand-secondary">${advisor.elr}</p>
                         </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-4 bg-slate-950/20 border-t border-slate-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Repair Orders:</span>
                      <span className="text-xs font-black text-white">{advisor.soCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 rounded-full">
                       <CheckCircle2 size={10} className="text-emerald-500" />
                       <span className="text-[9px] font-black text-emerald-500 uppercase">Verified</span>
                    </div>
                  </div>

                  <div className="px-6 py-4 bg-slate-950/40 border-t border-slate-800/50">
                    <button 
                      onClick={() => setExpandedAdvisors(prev => ({ ...prev, [advisor.name]: !prev[advisor.name] }))}
                      className="w-full flex items-center justify-between group/btn"
                    >
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-brand-primary/10 rounded-lg group-hover/btn:bg-brand-primary/20 transition-colors">
                          <Target size={14} className="text-brand-primary" />
                        </div>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Service Frequency / Upsells</span>
                      </div>
                      <ChevronDown 
                        size={16} 
                        className={cn(
                          "text-slate-600 transition-transform duration-300",
                          expandedAdvisors[advisor.name] && "rotate-180"
                        )} 
                      />
                    </button>
                    
                    <AnimatePresence>
                      {expandedAdvisors[advisor.name] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-4 space-y-2">
                            {advisor.upsells?.map((item, i) => (
                              <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/30 hover:border-slate-700/50 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-[8px] font-black text-slate-400 border border-slate-700/50">
                                    {item.code}
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-white leading-none mb-1">
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
                              <p className="text-center py-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest italic">No upsell data available</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
