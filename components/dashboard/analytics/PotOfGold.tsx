import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy, Users, Settings, BarChart3, Target, DollarSign,
  ChevronRight, TrendingUp, Save, Trash2, Download, Upload,
  Zap, Shield, Plus, Info, X, BrainCircuit, Loader2, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import { PageHeader } from '../../layout/PageHeader';
import { KpiStrip } from '../../ui/KpiStrip';
import { PageSkeleton } from '../../ui/Skeleton';
import { buildOperationsViewPeriodOptions, formatArchiveDisplayLabel } from '../../../lib/operationsViewPeriod';
import {
  getDealershipStaffConfig,
  type CompetitionAdvisorSlot,
  type CompetitionTechnicianSlot,
} from '../../../lib/dealershipStaff';
import {
  POT_OF_GOLD_OP_CODES,
  buildEmptyAdvisorRows,
  buildEmptyTechRows,
  mergeAdvisorRowsFromFirestore,
  type AdvisorPerformanceRow,
  type TechPerformanceRow,
} from '../../../lib/potOfGoldData';

const ADVISOR_CHART_COLORS = ['#2e86c1', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6', '#1abc9c'];

interface PotOfGoldProps {
  currentDealershipId: string;
}

// Merges saved technician rows (keyed by technician display name) onto the current
// roster's template, dropping stale technicians and zero-filling new ones.
function mergeTechRowsFromFirestore(
  stored: TechPerformanceRow[] | undefined,
  technicianLabels: string[]
): TechPerformanceRow[] {
  const template = buildEmptyTechRows(technicianLabels);
  if (!stored?.length) return template;

  return template.map((templateRow) => {
    const existing = stored.find((r) => r.code === templateRow.code);
    if (!existing) return templateRow;

    const merged: TechPerformanceRow = { code: templateRow.code, desc: templateRow.desc };
    technicianLabels.forEach((label) => {
      const val = existing[label];
      merged[label] = typeof val === 'number' ? val : Number(val) || 0;
    });
    return merged;
  });
}

interface ValidationResult {
  ok: boolean;
  issues: string[];
}

export const PotOfGold: React.FC<PotOfGoldProps> = ({ currentDealershipId }) => {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>('active');
  const viewPeriodOptions = useMemo(() => buildOperationsViewPeriodOptions(), []);
  const [activeSubTab, setActiveSubTab] = useState<'advisors' | 'technicians' | 'upsells' | 'performance'>('advisors');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Per-dealership roster (advisors + technicians). Defaults resolve instantly from
  // dealerDefaults/dealershipStaff so the UI never falls back to another dealership's names,
  // then get refined by the live dealershipSettings doc below.
  const [advisorRoster, setAdvisorRoster] = useState<CompetitionAdvisorSlot[]>(() =>
    getDealershipStaffConfig(currentDealershipId).competitionAdvisors
  );
  const [technicianRoster, setTechnicianRoster] = useState<CompetitionTechnicianSlot[]>(() =>
    getDealershipStaffConfig(currentDealershipId).competitionTechnicians
  );

  const technicianLabels = useMemo(() => technicianRoster.map((t) => t.label), [technicianRoster]);

  const [advData, setAdvData] = useState<AdvisorPerformanceRow[]>(() => buildEmptyAdvisorRows(advisorRoster));
  const [techData, setTechData] = useState<TechPerformanceRow[]>(() => buildEmptyTechRows(technicianLabels));
  const [prices, setPrices] = useState<Record<string, number>>(() => {
    const p: Record<string, number> = {};
    POT_OF_GOLD_OP_CODES.forEach(d => p[d.code] = 0);
    return p;
  });

  // Reset roster to this dealership's defaults immediately on switch, before the
  // settings doc below has a chance to load.
  useEffect(() => {
    const cfg = getDealershipStaffConfig(currentDealershipId);
    setAdvisorRoster(cfg.competitionAdvisors);
    setTechnicianRoster(cfg.competitionTechnicians);
  }, [currentDealershipId]);

  // Live roster sync — pulls the dealership's configured advisor/technician lists
  // (Admin -> dealership settings) instead of a single hardcoded roster for every store.
  useEffect(() => {
    if (!currentDealershipId) return;
    const settingsRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings', currentDealershipId);
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      const data = docSnap.exists() ? docSnap.data() : null;
      const cfg = getDealershipStaffConfig(currentDealershipId, data);
      setAdvisorRoster(cfg.competitionAdvisors);
      setTechnicianRoster(cfg.competitionTechnicians);
    }, (error) => {
      console.error('Failed to load dealership staff roster:', error);
    });
    return () => unsubscribe();
  }, [currentDealershipId]);

  // realtime sync with firestore
  useEffect(() => {
    if (!user || !currentDealershipId) return;

    // Scoped by dealership - fallback to legacy 'potOfGold' for hyundai
    const baseId = currentDealershipId === 'hyundai' ? 'potOfGold' : `potOfGold_${currentDealershipId}`;
    const docId = selectedMonth === 'active' ? baseId : `${baseId}_archive_${selectedMonth}`;
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAdvData(mergeAdvisorRowsFromFirestore(data.advData, advisorRoster));
        setTechData(mergeTechRowsFromFirestore(data.techData, technicianLabels));
        if (data.prices) setPrices(data.prices);
      } else {
        // Reset to initial if no data yet for this dealership
        setAdvData(buildEmptyAdvisorRows(advisorRoster));
        setTechData(buildEmptyTechRows(technicianLabels));
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Firestore sync error:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user, currentDealershipId, selectedMonth, advisorRoster, technicianLabels]);

  const saveToFirestore = async (updates: { advData?: any, techData?: any, prices?: any }) => {
    if (!user || !currentDealershipId) return;
    const docId = currentDealershipId === 'hyundai' ? 'potOfGold' : `potOfGold_${currentDealershipId}`;
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    try {
      await setDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
    } catch (error) {
      console.error('Error saving to Firestore:', error);
    }
  };

  // Success message timer
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Calculations
  const calculateAdvisorTotals = () => {
    const totals: Record<string, number> = {};
    advisorRoster.forEach(a => totals[a.id] = 0);
    let grand = 0;
    advData.forEach(row => {
      advisorRoster.forEach(a => {
        const val = Number(row[a.id]) || 0;
        totals[a.id] += val;
        grand += val;
      });
    });
    return { totals, grand };
  };

  const calculateAdvisorEarnings = () => {
    const earnings: Record<string, number> = {};
    advisorRoster.forEach(a => earnings[a.id] = 0);
    let grand = 0;
    advData.forEach(row => {
      const price = prices[row.code] || 0;
      advisorRoster.forEach(a => {
        const cnt = Number(row[a.id]) || 0;
        const amt = cnt * price;
        earnings[a.id] += amt;
        grand += amt;
      });
    });
    return { earnings, grand };
  };

  const calculateTechTotals = () => {
    const totals: Record<string, number> = {};
    technicianLabels.forEach(t => totals[t] = 0);
    let grand = 0;
    techData.forEach(row => {
      technicianLabels.forEach(t => {
        const val = Number(row[t]) || 0;
        totals[t] += val;
        grand += val;
      });
    });
    return { totals, grand };
  };

  const calculateTechEarnings = () => {
    const earnings: Record<string, number> = {};
    technicianLabels.forEach(t => earnings[t] = 0);
    let grand = 0;
    techData.forEach(row => {
      const price = prices[row.code] || 0;
      technicianLabels.forEach(t => {
        const cnt = Number(row[t]) || 0;
        const amt = cnt * price;
        earnings[t] += amt;
        grand += amt;
      });
    });
    return { earnings, grand };
  };

  const advTotals = calculateAdvisorTotals();
  const advEarnings = calculateAdvisorEarnings();
  const techTotals = calculateTechTotals();
  const techEarnings = calculateTechEarnings();

  const handleClearData = async () => {
    const freshAdvData = buildEmptyAdvisorRows(advisorRoster);
    const freshTechData = buildEmptyTechRows(technicianLabels);

    await saveToFirestore({ advData: freshAdvData, techData: freshTechData });
    setSuccessMessage('All statistics have been reset successfully');
    setShowClearConfirm(false);
  };

  const chartData = advData.map(d => {
    const row: Record<string, string | number> = { name: d.code };
    advisorRoster.forEach(a => {
      row[a.label] = Number(d[a.id]) || 0;
    });
    return row;
  });

  // Real format validator — inspects the live advisor/technician sheets and payout
  // prices for actual problems instead of always reporting "OK".
  const runFormatValidator = () => {
    const issues: string[] = [];
    const knownCodes = new Set(POT_OF_GOLD_OP_CODES.map(c => c.code));
    const advisorIds = new Set(advisorRoster.map(a => a.id));
    const advisorLabelById = new Map(advisorRoster.map(a => [a.id, a.label]));
    const techLabelSet = new Set(technicianLabels);

    const checkRows = (
      rows: (AdvisorPerformanceRow | TechPerformanceRow)[],
      sheetName: string,
      knownKeys: Set<string>,
      labelFor: (key: string) => string
    ) => {
      const seenCodes = new Set<string>();
      rows.forEach(row => {
        if (!row.code) {
          issues.push(`${sheetName} sheet has a row with a missing op code.`);
          return;
        }
        if (!knownCodes.has(row.code)) {
          issues.push(`${sheetName} sheet has an unrecognized op code "${row.code}".`);
        }
        if (seenCodes.has(row.code)) {
          issues.push(`${sheetName} sheet has a duplicate op code "${row.code}".`);
        }
        seenCodes.add(row.code);

        Object.entries(row).forEach(([key, value]) => {
          if (key === 'code' || key === 'desc') return;
          const numeric = typeof value === 'number' ? value : Number(value);
          if (value === '' || value === null || Number.isNaN(numeric)) {
            issues.push(`"${row.code}" has a non-numeric value for ${labelFor(key)}.`);
          } else if (numeric < 0) {
            issues.push(`"${row.code}" has a negative count (${numeric}) for ${labelFor(key)}.`);
          }
          if (!knownKeys.has(key)) {
            issues.push(`"${row.code}" has data for "${labelFor(key)}", who is not on the current ${sheetName.toLowerCase()} roster.`);
          }
        });
      });
    };

    checkRows(advData, 'Advisor', advisorIds, (key) => advisorLabelById.get(key) || key);
    checkRows(techData, 'Technician', techLabelSet, (key) => key);

    POT_OF_GOLD_OP_CODES.forEach(({ code }) => {
      const price = prices[code];
      if (price === undefined || price === null || price === ('' as unknown)) {
        issues.push(`Op code "${code}" has no configured payout price.`);
        return;
      }
      const numericPrice = typeof price === 'number' ? price : Number(price);
      if (Number.isNaN(numericPrice)) {
        issues.push(`Op code "${code}" has a non-numeric payout price.`);
      } else if (numericPrice < 0) {
        issues.push(`Op code "${code}" has a negative payout price ($${numericPrice}).`);
      }
    });

    const uniqueIssues = Array.from(new Set(issues));
    setValidationResult({ ok: uniqueIssues.length === 0, issues: uniqueIssues });
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-8 pb-20 relative">
      <PageHeader
        title="Pot of Gold"
        description="Track advisor upsells, technician contributions, and competition payouts."
        breadcrumbs={[{ label: 'Competitions' }, { label: 'Pot of Gold' }]}
      />
      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md card-base rounded-[2.5rem] p-10 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-3xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 mb-6">
                  <Trash2 className="text-rose-500" size={32} />
                </div>
                <h3 className="text-2xl font-black tracking-tighter mb-4 uppercase" style={{ color: 'var(--color-text-primary)' }}>Clear All Data?</h3>
                <p className="crm-label text-sm leading-relaxed mb-8">
                  Are you sure you want to clear all current advisor and technician statistics?
                  <span className="block mt-2 text-rose-400/80 font-bold uppercase text-[10px] tracking-widest">
                    This action cannot be undone, but payout settings will be preserved.
                  </span>
                </p>
                <div className="flex items-center gap-4 w-full">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="btn-secondary flex-1 py-4 text-[10px] font-black uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearData}
                    className="flex-1 px-6 py-4 bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-rose-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Clear Now
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="absolute top-6 right-6 transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Notification */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-24 left-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-emerald-500/20 border border-emerald-400/30 flex items-center gap-3 min-w-[300px] justify-center"
          >
            <Zap size={18} fill="currentColor" />
            <span className="text-[11px] font-black uppercase tracking-widest">{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-[2.5rem] card-base p-5 md:p-12">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Trophy size={120} className="text-brand-primary" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/20 flex items-center justify-center border border-brand-primary/30">
                <Trophy className="text-brand-primary" size={24} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-primary italic">Incentive Program</span>
            </div>

            {/* Local Month/Archive Switcher */}
            <div className="flex items-center gap-2">
              <span className="crm-label text-[8px] uppercase tracking-widest leading-none">View Period:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 px-3 input-field w-auto text-[9px] font-black uppercase tracking-widest py-0 cursor-pointer"
              >
                {viewPeriodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4 uppercase" style={{ color: 'var(--color-text-primary)' }}>
             POT OF <span className="text-brand-primary">GOLD</span>
          </h2>
          <p className="crm-label max-w-xl text-sm leading-relaxed mb-6">
            Track advisor and technician upsell counts for your sales competition, and set payout pricing per Op Code.
          </p>

          {selectedMonth === 'active' ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={runFormatValidator}
                  className="btn-secondary text-[10px] font-black uppercase tracking-widest"
                >
                  <Shield size={16} className="text-brand-primary" />
                  Format Validator
                </button>
              </div>

              <AnimatePresence>
                {validationResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(
                      "rounded-2xl border p-5 max-w-2xl",
                      validationResult.ok
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                    )}
                  >
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                        {validationResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        {validationResult.ok
                          ? 'No data issues found'
                          : `${validationResult.issues.length} issue${validationResult.issues.length === 1 ? '' : 's'} found`}
                      </span>
                      <button
                        onClick={() => setValidationResult(null)}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {!validationResult.ok && (
                      <ul className="list-disc list-inside space-y-1 text-xs font-medium leading-relaxed">
                        {validationResult.issues.map((issue, idx) => (
                          <li key={idx}>{issue}</li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-5 py-3.5 card-base rounded-2xl shadow-xl">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                🔒 VIEWING HISTORY ARCHIVE ({formatArchiveDisplayLabel(selectedMonth)} - READ ONLY)
              </span>
            </div>
          )}
        </div>

        <KpiStrip
          className="mt-8 md:mt-10"
          tiles={[
            { label: 'Shop upsells', value: String(advTotals.grand), tone: 'info' },
            ...advisorRoster.map(a => ({ label: `${a.label} total`, value: String(advTotals.totals[a.id] || 0) })),
            { label: 'Pot of gold', value: `$${advEarnings.grand.toLocaleString()}`, tone: 'success' as const },
          ]}
        />
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-col lg:flex-row items-center gap-4 w-full">
        {/* Mobile Custom Dropdown */}
        <div className="block lg:hidden w-full relative">
          <div className="relative">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="w-full card-base rounded-2xl px-6 py-4 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.2em] focus:border-brand-primary outline-none shadow-xl transition-all active:scale-[0.98]"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-brand-primary/20 flex items-center justify-center">
                  {activeSubTab === 'advisors' && <Users size={14} className="text-brand-primary" />}
                  {activeSubTab === 'technicians' && <Shield size={14} className="text-brand-primary" />}
                  {activeSubTab === 'performance' && <BarChart3 size={14} className="text-brand-primary" />}
                  {activeSubTab === 'upsells' && <Settings size={14} className="text-brand-primary" />}
                </div>
                <span>
                  {activeSubTab === 'advisors' && 'Advisors View'}
                  {activeSubTab === 'technicians' && 'Technician View'}
                  {activeSubTab === 'performance' && 'Data Graph View'}
                  {activeSubTab === 'upsells' && 'Incentive Pricing'}
                </span>
              </div>
              <ChevronRight size={18} className={cn("text-brand-primary transition-transform duration-300", isMobileMenuOpen ? "-rotate-90" : "rotate-90")} />
            </button>

            <AnimatePresence>
              {isMobileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsMobileMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="absolute top-full left-0 right-0 mt-2 z-50 card-base rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
                  >
                    <div className="px-6 py-3 border-b" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-muted)' }}>
                      <span className="crm-label text-[8px] uppercase tracking-widest">Switch View</span>
                    </div>
                    {[
                      { id: 'advisors', label: 'Advisors View', icon: Users },
                      { id: 'technicians', label: 'Technician View', icon: Shield },
                      { id: 'performance', label: 'Data Graph View', icon: BarChart3 },
                      { id: 'upsells', label: 'Incentive Pricing', icon: Settings },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveSubTab(tab.id as any);
                          setIsMobileMenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-4 px-6 py-4.5 text-[10px] font-black uppercase tracking-widest text-left transition-colors border-b last:border-0",
                          activeSubTab === tab.id ? "bg-brand-primary/10 text-brand-primary" : "hover:bg-slate-100 dark:hover:bg-slate-800/50"
                        )}
                        style={activeSubTab === tab.id ? { borderColor: 'var(--color-surface-border)' } : { borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}
                      >
                        <tab.icon size={16} />
                        {tab.label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Desktop Tabs */}
        <div className="hidden lg:flex items-center gap-2 card-base p-1.5 rounded-2xl w-fit">
          {[
            { id: 'advisors', label: 'Advisors', icon: Users },
            { id: 'technicians', label: 'Technicians', icon: Shield },
            { id: 'performance', label: 'Graph View', icon: BarChart3 },
            { id: 'upsells', label: 'Incentive Payouts', icon: Settings },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeSubTab === tab.id
                  ? "bg-brand-primary text-white shadow-lg"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800/50"
              )}
              style={activeSubTab !== tab.id ? { color: 'var(--color-text-secondary)' } : undefined}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="min-h-[500px]"
        >
          {activeSubTab === 'advisors' && (
            <div className="space-y-6">
              <div className="overflow-x-auto rounded-3xl card-base">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-muted)' }}>
                      <th className="crm-label px-6 py-4 text-[10px] uppercase tracking-widest w-24">Code</th>
                      <th className="crm-label px-6 py-4 text-[10px] uppercase tracking-widest">Description</th>
                      {advisorRoster.map(a => (
                        <th key={a.id} className="crm-label px-6 py-4 text-[10px] uppercase tracking-widest text-center">{a.label}</th>
                      ))}
                      <th className="crm-label px-6 py-4 text-[10px] uppercase tracking-widest text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                    {advData.map((row, i) => (
                      <tr key={row.code} className="hover:bg-slate-900/5 dark:hover:bg-slate-800/20 transition-colors group">
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-brand-primary/10 text-brand-primary rounded text-[10px] font-black">{row.code}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>{row.desc}</p>
                        </td>
                        {advisorRoster.map(a => (
                          <td key={a.id} className="px-6 py-2 text-center">
                            <input
                              type="number"
                              value={Number(row[a.id]) || 0}
                              disabled={selectedMonth !== 'active'}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                const newData = advData.map((d, index) =>
                                  index === i ? { ...d, [a.id]: val } : d
                                );
                                setAdvData(newData);
                                saveToFirestore({ advData: newData });
                              }}
                              className="w-16 input-field px-2 py-1.5 text-center text-xs font-black"
                            />
                          </td>
                        ))}
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-black text-brand-secondary">
                            {advisorRoster.reduce((sum, a) => sum + (Number(row[a.id]) || 0), 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2" style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-surface-border)' }}>
                      <td colSpan={2} className="px-6 py-6 text-[10px] font-black uppercase tracking-widest italic" style={{ color: 'var(--color-text-primary)' }}>Advisor Grand Totals</td>
                      {advisorRoster.map(a => (
                        <td key={a.id} className="px-6 py-6 text-center text-lg font-black" style={{ color: 'var(--color-text-primary)' }}>{advTotals.totals[a.id] || 0}</td>
                      ))}
                      <td className="px-6 py-6 text-center text-lg font-black text-brand-primary">{advTotals.grand}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Advisor Earnings Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {[
                   ...advisorRoster.map(a => ({ name: a.label, val: advEarnings.earnings[a.id] || 0, primary: false })),
                   { name: 'Total Payout', val: advEarnings.grand, primary: true }
                 ].map((earn, idx) => (
                   <div key={idx} className={cn(
                     "p-6 rounded-3xl border flex flex-col items-center text-center",
                     earn.primary ? "bg-brand-primary/10 border-brand-primary" : "card-base"
                   )}>
                      <p className="crm-label text-[10px] uppercase tracking-widest mb-2 leading-none">{earn.name} Earnings</p>
                      <p className={cn("text-3xl font-black", earn.primary ? "text-brand-primary" : "")} style={!earn.primary ? { color: 'var(--color-text-primary)' } : undefined}>
                        ${earn.val.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                   </div>
                 ))}
              </div>
            </div>
          )}

          {activeSubTab === 'technicians' && (
            <div className="space-y-6">
              <div className="-mx-1 sm:mx-0 max-w-[100vw] sm:max-w-none overflow-x-auto no-scrollbar rounded-3xl card-base">
                <table className="w-full min-w-[560px] text-left border-collapse">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-muted)' }}>
                      <th className="crm-label sticky left-0 z-10 px-3 md:px-6 py-3 md:py-4 text-[10px] uppercase tracking-widest min-w-[100px]" style={{ backgroundColor: 'var(--color-surface-muted)' }}>Service Code</th>
                      {technicianLabels.map(t => (
                        <th key={t} className="crm-label px-2 md:px-4 py-3 md:py-4 text-[9px] md:text-[10px] uppercase tracking-widest text-center min-w-[52px] max-w-[64px] truncate">{t}</th>
                      ))}
                      <th className="crm-label px-3 md:px-6 py-3 md:py-4 text-[10px] uppercase tracking-widest text-center min-w-[56px]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                    {techData.map((row, rIdx) => (
                      <tr key={row.code} className="hover:bg-slate-900/5 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="sticky left-0 z-[1] px-3 md:px-6 py-3 md:py-4 min-w-[100px]" style={{ backgroundColor: 'var(--color-surface-card)' }}>
                          <div className="flex flex-col">
                            <span className="text-[10px] md:text-xs font-black" style={{ color: 'var(--color-text-primary)' }}>{row.code}</span>
                            <span className="crm-label text-[8px] md:text-[9px] uppercase leading-snug">{row.desc}</span>
                          </div>
                        </td>
                         {technicianLabels.map(t => (
                          <td key={t} className="px-2 py-2 text-center">
                            <input
                              type="number"
                              value={row[t]}
                              disabled={selectedMonth !== 'active'}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                const newData = techData.map((d, index) =>
                                  index === rIdx ? { ...d, [t]: val } : d
                                );
                                setTechData(newData);
                                saveToFirestore({ techData: newData });
                              }}
                              className="w-12 md:w-16 input-field px-1 py-1 text-center text-xs font-black"
                            />
                          </td>
                        ))}
                        <td className="px-6 py-4 text-center">
                          <span className="text-xs font-black text-brand-secondary">
                            {technicianLabels.reduce((sum, t) => sum + (Number(row[t]) || 0), 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2" style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-surface-border)' }}>
                      <td className="px-6 py-6 text-[10px] font-black uppercase tracking-widest italic" style={{ color: 'var(--color-text-primary)' }}>Tech Grand Totals</td>
                      {technicianLabels.map(t => (
                        <td key={t} className="px-4 py-6 text-center text-base font-black" style={{ color: 'var(--color-text-primary)' }}>{techTotals.totals[t]}</td>
                      ))}
                      <td className="px-6 py-6 text-center text-lg font-black text-brand-primary">{techTotals.grand}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

               {/* Tech Earnings Summary */}
               <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                  {technicianLabels.map(t => (
                    <div key={t} className="p-4 card-base rounded-2xl flex flex-col items-center">
                      <p className="crm-label text-[9px] uppercase mb-2">{t}</p>
                      <p className="text-lg font-black text-emerald-500 dark:text-emerald-400">
                        ${techEarnings.earnings[t].toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeSubTab === 'upsells' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="card-base rounded-3xl overflow-hidden p-8">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-brand-primary/10 rounded-2xl">
                    <Settings className="text-brand-primary" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black tracking-tighter uppercase" style={{ color: 'var(--color-text-primary)' }}>Incentive Pricing</h4>
                    <p className="crm-label text-xs uppercase tracking-widest mt-1">Configure payout values per Operation Code</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {POT_OF_GOLD_OP_CODES.map(d => (
                    <div key={d.code} className="flex items-center justify-between p-4 card-base rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-[10px] font-black border" style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                            {d.code}
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase leading-none mb-1" style={{ color: 'var(--color-text-primary)' }}>{d.desc}</p>
                          </div>
                       </div>
                       <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-primary">
                            <DollarSign size={14} />
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            value={prices[d.code]}
                            disabled={selectedMonth !== 'active'}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              const newPrices = { ...prices, [d.code]: val };
                              setPrices(newPrices);
                              saveToFirestore({ prices: newPrices });
                            }}
                            className="input-field pl-8 pr-4 py-2.5 text-sm font-black w-32"
                          />
                       </div>
                    </div>
                  ))}
                </div>

                {selectedMonth === 'active' && (
                  <div className="mt-12 flex flex-col md:flex-row gap-4 justify-between items-center pt-8 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
                     <div className="flex items-center gap-3">
                        <div className="p-3 bg-rose-500/10 rounded-2xl">
                          <Trash2 className="text-rose-500" size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-rose-500 uppercase">Reset Competition</p>
                          <p className="crm-label text-[10px] uppercase tracking-widest">This will clear all current entry data</p>
                        </div>
                     </div>
                     <button
                      onClick={() => setShowClearConfirm(true)}
                      className="px-8 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                     >
                       Reset All Statistics
                     </button>
                  </div>
                )}
              </div>

              {/* Data Persistence Info */}
              <div className="p-6 card-base rounded-3xl flex items-start gap-4">
                 <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Info className="text-emerald-500" size={16} />
                 </div>
                 <div className="flex-1">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--color-text-primary)' }}>Synced in Real Time</h5>
                    <p className="crm-label text-xs leading-relaxed">
                      Your competition data is saved to the shared database as you type, so every device viewing this dealership sees the same numbers. Use Reset All Statistics to clear it when a new month starts.
                    </p>
                 </div>
              </div>
            </div>
          )}

          {activeSubTab === 'performance' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Advisor Chart */}
                <div className="card-base rounded-[2.5rem] p-8 min-h-[450px] flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-brand-primary/10 rounded-xl">
                          <BarChart3 className="text-brand-primary" size={20} />
                        </div>
                        <h4 className="text-lg font-black uppercase tracking-tighter" style={{ color: 'var(--color-text-primary)' }}>Advisor Distribution</h4>
                     </div>
                  </div>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" vertical={false} />
                        <XAxis
                          dataKey="name"
                          stroke="var(--color-text-tertiary)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="var(--color-text-tertiary)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', borderRadius: '12px' }}
                          itemStyle={{ color: 'var(--color-text-primary)', fontSize: '12px', fontWeight: 'bold' }}
                          labelStyle={{ color: 'var(--color-text-secondary)' }}
                        />
                        <Legend wrapperStyle={{ color: 'var(--color-text-secondary)', fontSize: '11px' }} />
                        {advisorRoster.map((a, idx) => (
                          <Bar key={a.id} dataKey={a.label} fill={ADVISOR_CHART_COLORS[idx % ADVISOR_CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tech Highlights */}
                <div className="card-base rounded-[2.5rem] p-8 flex flex-col">
                   <div className="flex items-center gap-3 mb-8">
                      <div className="p-2.5 bg-brand-secondary/10 rounded-xl">
                        <Target className="text-brand-secondary" size={20} />
                      </div>
                      <h4 className="text-lg font-black uppercase tracking-tighter" style={{ color: 'var(--color-text-primary)' }}>Technician Leaderboard</h4>
                   </div>

                   <div className="space-y-4 flex-1">
                      {technicianLabels
                        .map(t => ({ name: t, total: techTotals.totals[t] }))
                        .sort((a, b) => b.total - a.total)
                        .map((tech, i, ranked) => {
                          const maxTotal = ranked[0]?.total || 0;
                          const meterPct = maxTotal > 0 ? Math.max(4, Math.round((tech.total / maxTotal) * 100)) : 0;
                          return (
                            <div key={tech.name} className="p-4 card-base rounded-2xl group hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                               <div className="flex items-center justify-between gap-4 mb-3">
                                  <div className="flex items-center gap-4 min-w-0">
                                     <div className={cn(
                                       "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-xs font-black border",
                                       i === 0 ? "bg-amber-500/10 text-amber-500 border-amber-500/30" : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700"
                                     )}>
                                       {i + 1}
                                     </div>
                                     <div className="min-w-0">
                                       <p className="text-sm font-black uppercase tracking-tight truncate" style={{ color: 'var(--color-text-primary)' }}>{tech.name}</p>
                                       <p className="crm-label text-[9px] uppercase tracking-widest mt-0.5">Service Technician</p>
                                     </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-lg font-black" style={{ color: 'var(--color-text-primary)' }}>{tech.total}</p>
                                    <p className="text-[9px] font-bold text-emerald-500 uppercase">Upsells Logged</p>
                                  </div>
                               </div>
                               {/* Meter bar — same color family & weight as the Advisor Distribution chart beside it */}
                               <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${meterPct}%`, backgroundColor: ADVISOR_CHART_COLORS[0] }}
                                  />
                               </div>
                            </div>
                          );
                        })
                      }
                   </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
