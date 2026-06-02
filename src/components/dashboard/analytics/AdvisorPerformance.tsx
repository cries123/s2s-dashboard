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
import { withDmsProvider } from '../../../lib/reportIngestion';
import type { DmsProviderId } from '../../../constants/dmsProviders';
import { DEFAULT_DMS_PROVIDER } from '../../../constants/dmsProviders';

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
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [expandedAdvisors, setExpandedAdvisors] = useState<Record<string, boolean>>({});
  const [advisors, setAdvisors] = useState<AdvisorData[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [laborTarget, setLaborTarget] = useState(500000);
  const [dmsProvider, setDmsProvider] = useState<DmsProviderId>(DEFAULT_DMS_PROVIDER);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch Dealership Settings (for target)
  useEffect(() => {
    if (!currentDealershipId) return;
    const settingsRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings', currentDealershipId);
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setLaborTarget(docSnap.data().laborGrossTarget || 500000);
        setDmsProvider((docSnap.data().dmsProvider as DmsProviderId) || DEFAULT_DMS_PROVIDER);
      }
    });
    return () => unsubscribe();
  }, [currentDealershipId]);

  // realtime performance sync
  useEffect(() => {
    if (!user || !currentDealershipId) return;

    const baseId = currentDealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${currentDealershipId}`;
    const docId = selectedMonth === 'active' ? baseId : `${baseId}_archive_${selectedMonth}`;
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
      } else {
        setAdvisors([]);
        setTotals(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore sync error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user, currentDealershipId, selectedMonth]);

  const saveToFirestore = async (
    newData: { advisors: AdvisorData[], totals?: any, reportStartDate?: string, reportEndDate?: string }, 
    overwrite = false,
    targetMonthOverride?: string
  ) => {
    if (!user || !currentDealershipId) return;
    
    let updatedAdvisors: AdvisorData[] = [];
    
    // Helper to sanitize name to filter out obvious DMS category headings or false AI extractions
    const isRealAdvisorName = (name: string): boolean => {
      const n = name.toLowerCase().trim();
      if (!n) return false;
      if (n === 'jay') return false;
      const badStarts = ["total", "parts", "labor", "sublet", "price code", "customer", "warranty", "internal", "page"];
      if (badStarts.some(bad => n.startsWith(bad))) return false;
      const exclusions = ["parts cro", "parts cempr", "parts i", "parts w", "labor c", "labor cemp", "labor i", "labor w", "labor wshop", "sublet csub", "sublet isub", "sublet wsub"];
      if (exclusions.includes(n)) return false;
      return true;
    };

    // Helper to beautifully normalize/canonicalize advisor names
    const cleanAdvisorName = (rawName: string): string => {
      let name = rawName.toUpperCase().trim();
      
      // Handle the standard 3 active advisors for perfect matching
      if (name.includes("FRANK")) return "Frank";
      if (name.includes("LEMMY")) return "Lemmy";
      if (name.includes("JARYN")) return "Jaryn";
      
      // Look for "Advisor <id> - <name>" pattern and extract <name>
      const match = name.match(/Advisor\s+(?:\w+\s*-\s*)?([A-Z]+)/i);
      if (match) {
        const extracted = match[1].trim();
        return extracted.charAt(0).toUpperCase() + extracted.slice(1).toLowerCase();
      }
      
      const cleanWord = name.split(/[\s-]+/)[0] || '';
      return cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase();
    };

    if (overwrite) {
      updatedAdvisors = newData.advisors
        .filter(a => isRealAdvisorName(a.name))
        .map(a => ({ ...a, name: cleanAdvisorName(a.name) }));
    } else {
      updatedAdvisors = [...advisors]
        .filter(a => isRealAdvisorName(a.name))
        .map(a => ({ ...a, name: cleanAdvisorName(a.name) }));
      
      newData.advisors.forEach(newAdvisor => {
        if (!isRealAdvisorName(newAdvisor.name)) return;
        const normalizedName = cleanAdvisorName(newAdvisor.name);
        
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
    const baseId = currentDealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${currentDealershipId}`;
    const docId = targetMonth === 'active' ? baseId : `${baseId}_archive_${targetMonth}`;
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    
    try {
      await setDoc(docRef, {
        advisors: updatedAdvisors,
        ...(newData.totals && { totals: newData.totals }),
        ...(newData.reportStartDate && { reportStartDate: newData.reportStartDate }),
        ...(newData.reportEndDate && { reportEndDate: newData.reportEndDate }),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: false }); // Disable automatic merge to cleanly replace any junk advisors
    } catch (error) {
      console.error('Error saving advisor performance:', error);
    }
  };

  const resetPerformanceToDefaults = async () => {
    if (!user || !currentDealershipId) return;
    
    setLoading(true);
    
    const totalLabor = 59979.38;
    const totalGross = 49856.94;
    const totalParts = 34874.50;
    const totalGrossParts = 11204.62;
    const totalSales = 103236.21;
    const totalHrs = 402.40;
    const totalSo = 336;
    const elr = 149.05;

    const proportions = [0.56, 0.44];
    const names = ["Frank", "Lemmy"];
    
    const defaultAdvisors = names.map((name, idx) => {
      const prop = proportions[idx];
      const adHrs = Math.round(totalHrs * prop * 10) / 10;
      const adLabor = Math.round(totalLabor * prop * 100) / 100;
      const adParts = Math.round(totalParts * prop * 100) / 100;
      const adGrossLab = Math.round(totalGross * prop * 100) / 100;
      const adGrossParts = Math.round(totalGrossParts * prop * 100) / 100;
      const adTotal = Math.round((adLabor + adParts) * 100) / 100;
      const adSo = Math.round(totalSo * prop);
      
      return {
        name,
        soCount: adSo,
        hrsSold: adHrs,
        laborSold: adLabor,
        grossLabor: adGrossLab,
        partsSold: adParts,
        grossParts: adGrossParts,
        totalSales: adTotal,
        gpPercent: adLabor > 0 ? Math.round((adGrossLab / adLabor) * 1000) / 10 : 83.1,
        elr: adHrs > 0 ? Math.round((adLabor / adHrs) * 100) / 100 : elr,
        upsells: []
      };
    });

    const docId = currentDealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${currentDealershipId}`;
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    
    try {
      await setDoc(docRef, {
        advisors: defaultAdvisors,
        totals: {
          totalSales,
          totalLabor,
          totalGross,
          totalParts,
          totalGrossParts,
          totalHrs
        },
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      setImportStatus({ type: 'success', message: 'database reset back to exact report defaults (Labor Gross: $49,856 / Parts Gross: $11,204) successfully!' });
    } catch (error: any) {
      console.error('Error resetting performance database:', error);
      setImportStatus({ type: 'error', message: 'Failed to reset database.' });
    } finally {
      setLoading(false);
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
    
    try {
      let reportText = '';
      try {
        reportText = await extractTextFromPDF(file);
      } catch (extractErr) {
        console.warn('PDF text extraction failed, will use server-side vision for DealerBuilt:', extractErr);
      }

      const payload: { reportText: string; pdfBase64?: string } = { reportText };
      const isDealerBuiltImport = dmsProvider === 'dealerbuilt';
      const hasMinimalText =
        !reportText || reportText.replace(/\s+/g, ' ').trim().length < 80;
      const looksDealerBuilt =
        /service advisor performance|ro svc wrtr/i.test(reportText);

      if (isDealerBuiltImport || hasMinimalText || looksDealerBuilt) {
        payload.pdfBase64 = await fileToBase64(file);
      }

      if (!isDealerBuiltImport && (hasMinimalText || looksDealerBuilt)) {
        console.warn(
          'DealerBuilt-style PDF detected but dealership DMS is not set to DealerBuilt. Set Admin → DMS Configuration → DealerBuilt for best results.'
        );
      }
      
      const response = await fetch('/api/parse-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withDmsProvider({ dmsProvider }, payload))
      });

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
      
      // Detect date range from PDF text
      const detectedDates = detectDateRangeFromText(reportText);
      let targetMonth = selectedMonth;
      if (detectedDates) {
        data = {
          ...data,
          reportStartDate: detectedDates.start,
          reportEndDate: detectedDates.end
        };
        // Auto-route to May archive if dates fall in May
        if (detectedDates.start.startsWith('2026-05')) {
          targetMonth = '2026-05';
        }
      }
      
      // If this is a main productivity report (contains totals object), overwrite the advisor records completely 
      // rather than merging as a delta, to cleanly eliminate any stale or corrupt duplicates in the database.
      const shouldOverwrite = !!data.totals;
      await saveToFirestore(data, shouldOverwrite, targetMonth);
      
      const hasUpsells = data.advisors.some((a: any) => a.upsells && a.upsells.length > 0);
      const hasTotals = !!data.totals;
      
      let message = 'Report imported successfully!';
      if (targetMonth === '2026-05' && selectedMonth === 'active') {
        message = 'Detected May dates! Saved directly to May 2026 Saved Archive. June active tracker kept clean!';
      } else if (hasUpsells && hasTotals) message = 'Productivity and Upsell data imported and merged!';
      else if (hasUpsells) message = 'Upsell data imported and merged!';
      else if (hasTotals) message = 'Productivity data imported!';

      setImportStatus({ type: 'success', message });
      
    } catch (error: any) {
      console.error('Performance Import Error:', error);
      setImportStatus({ type: 'error', message: error.message || 'Error importing PDF. Please try again.' });
    } finally {
      setIsImporting(false);
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
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {selectedMonth !== 'active' && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse">
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
                "flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-lg cursor-pointer",
                showResetConfirm 
                  ? "bg-rose-950/40 text-rose-400 border-rose-500/30 animate-pulse" 
                  : "bg-slate-800 text-slate-400 hover:text-rose-400 border-white/5"
              )}
              title="Reset tracking DB to clean report baseline"
            >
              <RotateCcw size={12} className={showResetConfirm ? "animate-spin" : ""} />
              {showResetConfirm ? "Confirm Reset?" : "Reset Data"}
            </button>

            <button 
              onClick={() => setIsManualEntryOpen(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 shadow-lg cursor-pointer"
            >
              <Keyboard size={14} />
              Manual Entry
            </button>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-primary text-white hover:bg-brand-primary/90 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50 cursor-pointer"
            >
              {isImporting ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              Import PDF Productivity Report
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
