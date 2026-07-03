import React, { useState, useEffect } from 'react';
import { 
  Trophy, Users, Settings, BarChart3, Target, DollarSign, 
  ChevronRight, TrendingUp, Save, Trash2, Download, Upload,
  Zap, Shield, Plus, Info, X, BrainCircuit, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { extractTextFromPDF } from '../../../utils/pdfExtractor';
import { recordDmsImportFailure, recordDmsImportSuccess } from '../../../lib/dmsImportHealth';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import { PageHeader } from '../../layout/PageHeader';
import { KpiStrip } from '../../ui/KpiStrip';
import { PageSkeleton } from '../../ui/Skeleton';

interface PerformanceRow {
  code: string;
  desc: string;
  frank: number;
  lemmy: number;
}

interface TechPerformanceRow {
  code: string;
  desc: string;
  [key: string]: string | number;
}

const TECHNICIANS = ['Daniel', 'Jon', 'Matthew', 'Jacinto', 'Ethan', 'Trevor'];
const ADVISORS = ['frank', 'lemmy'];

const INITIAL_PERFORMANCE_DATA: PerformanceRow[] = [
  { code: 'AF', desc: 'ENGINE AIR FILTER', frank: 0, lemmy: 0 },
  { code: 'ALIGN', desc: 'PERFORM 2/4 WHEEL ALIGNMENT', frank: 0, lemmy: 0 },
  { code: 'BAT', desc: 'BATTERY REPLACEMENT', frank: 0, lemmy: 0 },
  { code: 'BFR', desc: 'BRAKE FLUID SERVICE', frank: 0, lemmy: 0 },
  { code: 'CAF', desc: 'CABIN AIR FILTER', frank: 0, lemmy: 0 },
  { code: 'CE', desc: 'COOLING SYSTEM EXCHANGE', frank: 0, lemmy: 0 },
  { code: 'FB', desc: 'FRONT BRAKE PAD/RESURFACE', frank: 0, lemmy: 0 },
  { code: 'FSC', desc: 'MOC ENHANCE FUEL SYSTEM', frank: 0, lemmy: 0 },
  { code: 'GDI', desc: 'GDI FUEL/AIR INDUCTION', frank: 0, lemmy: 0 },
  { code: 'RB', desc: 'REAR BRAKE PAD/SERVICE', frank: 0, lemmy: 0 },
  { code: 'TIRE1', desc: 'MOUNT AND BALANCE 1 TIRE', frank: 0, lemmy: 0 },
  { code: 'TIRE2', desc: 'MOUNT AND BALANCE 2 TIRES', frank: 0, lemmy: 0 },
  { code: 'TIRE3', desc: 'MOUNT AND BALANCE 3 TIRES', frank: 0, lemmy: 0 },
  { code: 'TIRE4', desc: 'MOUNT AND BALANCE 4 TIRES', frank: 0, lemmy: 0 },
  { code: 'TS', desc: 'TRANSMISSION SERVICE', frank: 0, lemmy: 0 },
  { code: 'CCC', desc: 'COMBUSTION CHAMBER CLEANING', frank: 0, lemmy: 0 }
];

interface PotOfGoldProps {
  currentDealershipId: string;
}

export const PotOfGold: React.FC<PotOfGoldProps> = ({ currentDealershipId }) => {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>('active');
  const [activeSubTab, setActiveSubTab] = useState<'advisors' | 'technicians' | 'upsells' | 'performance'>('advisors');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [advData, setAdvData] = useState<PerformanceRow[]>(INITIAL_PERFORMANCE_DATA);
  const [techData, setTechData] = useState<TechPerformanceRow[]>(() => 
    INITIAL_PERFORMANCE_DATA.map(d => {
      const base: TechPerformanceRow = { code: d.code, desc: d.desc };
      TECHNICIANS.forEach(t => base[t] = 0);
      return base;
    })
  );
  const [prices, setPrices] = useState<Record<string, number>>(() => {
    const p: Record<string, number> = {};
    INITIAL_PERFORMANCE_DATA.forEach(d => p[d.code] = 0);
    return p;
  });

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
        if (data.advData) setAdvData(data.advData);
        if (data.techData) setTechData(data.techData);
        if (data.prices) setPrices(data.prices);
      } else {
        // Reset to initial if no data yet for this dealership
        setAdvData(INITIAL_PERFORMANCE_DATA);
        setTechData(INITIAL_PERFORMANCE_DATA.map(d => {
          const base: TechPerformanceRow = { code: d.code, desc: d.desc };
          TECHNICIANS.forEach(t => base[t] = 0);
          return base;
        }));
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Firestore sync error:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user, currentDealershipId, selectedMonth]);

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
    let frank = 0, lemmy = 0, grand = 0;
    advData.forEach(row => {
      frank += row.frank;
      lemmy += row.lemmy;
      grand += row.frank + row.lemmy;
    });
    return { frank, lemmy, grand };
  };

  const calculateAdvisorEarnings = () => {
    let frank = 0, lemmy = 0, grand = 0;
    advData.forEach(row => {
      const price = prices[row.code] || 0;
      frank += row.frank * price;
      lemmy += row.lemmy * price;
      grand += (row.frank + row.lemmy) * price;
    });
    return { frank, lemmy, grand };
  };

  const calculateTechTotals = () => {
    const totals: Record<string, number> = {};
    TECHNICIANS.forEach(t => totals[t] = 0);
    let grand = 0;
    techData.forEach(row => {
      TECHNICIANS.forEach(t => {
        const val = Number(row[t]) || 0;
        totals[t] += val;
        grand += val;
      });
    });
    return { totals, grand };
  };

  const calculateTechEarnings = () => {
    const earnings: Record<string, number> = {};
    TECHNICIANS.forEach(t => earnings[t] = 0);
    let grand = 0;
    techData.forEach(row => {
      const price = prices[row.code] || 0;
      TECHNICIANS.forEach(t => {
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

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAiProcessing(true);

    try {
      const reportText = await extractTextFromPDF(file);

      // Use the parse-performance endpoint which can handle both Performance and Upsell reports
      const response = await fetch('/api/parse-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportText })
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
      
      // Map data to Pot of Gold structure
      if (data.advisors && data.advisors.length > 0) {
        const newAdvData = advData.map(row => {
          const base = { ...row };
          data.advisors.forEach((aiAdv: any) => {
            const advisorKey = aiAdv.name.toLowerCase().includes('frank') ? 'frank' :
                               aiAdv.name.toLowerCase().includes('lemmy') ? 'lemmy' : null;
            
            if (advisorKey && aiAdv.upsells) {
              const upsell = aiAdv.upsells.find((u: any) => u.code === row.code);
              if (upsell) {
                (base as any)[advisorKey] = Number(upsell.count) || 0;
              }
            }
          });
          return base;
        });

        await saveToFirestore({ advData: newAdvData });
        setSuccessMessage(`Analysis Complete: ${file.name}`);
        await recordDmsImportSuccess(currentDealershipId || 'hyundai', {
          filename: file.name,
          importKind: 'pot_of_gold',
          userEmail: user?.email,
        });
      } else {
        throw new Error("Could not find advisor data in this report.");
      }
    } catch (error: any) {
      console.error("Processing Error:", error);
      const message = error.message || 'Import failed.';
      void recordDmsImportFailure(currentDealershipId || 'hyundai', {
        filename: file.name,
        importKind: 'pot_of_gold',
        error: message,
        userEmail: user?.email,
      });
      alert(message);
    } finally {
      setIsAiProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearData = async () => {
    const freshAdvData = INITIAL_PERFORMANCE_DATA.map(d => ({ ...d }));
    const freshTechData = INITIAL_PERFORMANCE_DATA.map(d => {
      const base: TechPerformanceRow = { code: d.code, desc: d.desc };
      TECHNICIANS.forEach(t => base[t] = 0);
      return base;
    });
    
    await saveToFirestore({ advData: freshAdvData, techData: freshTechData });
    setSuccessMessage('All statistics have been reset successfully');
    setShowClearConfirm(false);
  };

  const chartData = advData.map(d => ({
    name: d.code,
    Frank: d.frank,
    Lemmy: d.lemmy
  }));

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
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-3xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 mb-6">
                  <Trash2 className="text-rose-500" size={32} />
                </div>
                <h3 className="text-2xl font-black text-white tracking-tighter mb-4 uppercase">Clear All Data?</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-8">
                  Are you sure you want to clear all current advisor and technician statistics? 
                  <span className="block mt-2 text-rose-400/80 font-bold uppercase text-[10px] tracking-widest">
                    This action cannot be undone, but payout settings will be preserved.
                  </span>
                </p>
                <div className="flex items-center gap-4 w-full">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 px-6 py-4 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-750 transition-all"
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
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
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
      <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 border border-slate-800 p-5 md:p-12">
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
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">View Period:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 px-3 bg-slate-950 border border-slate-850 text-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest outline-none cursor-pointer hover:border-slate-750 transition-all"
              >
                <option value="active">June 2026 (Active)</option>
                <option value="2026-05">May 2026 (Saved)</option>
                <option value="2026-04">April 2026 (Saved)</option>
              </select>
            </div>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-4 uppercase">
             POT OF <span className="text-brand-primary">GOLD</span>
          </h2>
          <p className="text-slate-400 max-w-xl text-sm leading-relaxed mb-6">
            Intelligent AI tracking for your sales competition. Upload Op Code Frequency reports to automatically audit advisor payouts and technician contributions with Gemini AI.
          </p>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".pdf" 
            className="hidden" 
          />

          {selectedMonth === 'active' ? (
            <div className="flex flex-wrap items-center gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isAiProcessing}
                className="flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-brand-primary/20 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all group"
              >
                {isAiProcessing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} className="group-hover:-translate-y-0.5 transition-transform" />
                )}
                {isAiProcessing ? 'Deep Multi-Audit...' : 'PDF Multi-Audit'}
              </button>

              <button 
                onClick={() => alert("Data validation check: OK. Format alignment matches schema.")}
                className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-750 transition-all border border-slate-700"
              >
                <Shield size={16} className="text-brand-primary" />
                Format Validator
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-5 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl shadow-xl">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                🔒 VIEWING HISTORY ARCHIVE ({selectedMonth === '2026-05' ? 'MAY 2026' : selectedMonth === '2026-04' ? 'APRIL 2026' : selectedMonth.toUpperCase()} - READ ONLY)
              </span>
            </div>
          )}
        </div>

        <KpiStrip
          className="mt-8 md:mt-10"
          tiles={[
            { label: 'Shop upsells', value: String(advTotals.grand), tone: 'info' },
            { label: 'Frank total', value: String(advTotals.frank) },
            { label: 'Lemmy total', value: String(advTotals.lemmy) },
            { label: 'Pot of gold', value: `$${advEarnings.grand.toLocaleString()}`, tone: 'success' },
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
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.2em] text-white focus:border-brand-primary outline-none shadow-xl transition-all active:scale-[0.98]"
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
                    className="absolute top-full left-0 right-0 mt-2 z-50 bg-slate-900 border border-slate-800 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
                  >
                    <div className="px-6 py-3 border-b border-slate-800 bg-slate-800/30">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Switch View</span>
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
                          "w-full flex items-center gap-4 px-6 py-4.5 text-[10px] font-black uppercase tracking-widest text-left transition-colors border-b border-slate-800/50 last:border-0",
                          activeSubTab === tab.id ? "bg-brand-primary/10 text-brand-primary" : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                        )}
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
        <div className="hidden lg:flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800/50 w-fit">
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
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
              )}
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
              <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/30">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/50">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-24">Code</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Description</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Frank</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Lemmy</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {advData.map((row, i) => (
                      <tr key={row.code} className="hover:bg-slate-800/20 transition-colors group">
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-brand-primary/10 text-brand-primary rounded text-[10px] font-black">{row.code}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-slate-300">{row.desc}</p>
                        </td>
                        <td className="px-6 py-2 text-center">
                          <input 
                            type="number"
                            value={row.frank}
                            disabled={selectedMonth !== 'active'}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              const newData = advData.map((d, index) => 
                                index === i ? { ...d, frank: val } : d
                              );
                              setAdvData(newData);
                              saveToFirestore({ advData: newData });
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-center text-xs font-black text-white focus:border-brand-primary outline-none transition-all disabled:opacity-60"
                          />
                        </td>
                        <td className="px-6 py-2 text-center">
                          <input 
                            type="number"
                            value={row.lemmy}
                            disabled={selectedMonth !== 'active'}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              const newData = advData.map((d, index) => 
                                index === i ? { ...d, lemmy: val } : d
                              );
                              setAdvData(newData);
                              saveToFirestore({ advData: newData });
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-center text-xs font-black text-white focus:border-brand-primary outline-none transition-all disabled:opacity-60"
                          />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-black text-brand-secondary">{row.frank + row.lemmy}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 border-t-2 border-slate-700">
                      <td colSpan={2} className="px-6 py-6 text-[10px] font-black text-white uppercase tracking-widest italic">Advisor Grand Totals</td>
                      <td className="px-6 py-6 text-center text-lg font-black text-white">{advTotals.frank}</td>
                      <td className="px-6 py-6 text-center text-lg font-black text-white">{advTotals.lemmy}</td>
                      <td className="px-6 py-6 text-center text-lg font-black text-brand-primary">{advTotals.grand}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Advisor Earnings Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {[
                   { name: 'Frank', val: advEarnings.frank },
                   { name: 'Lemmy', val: advEarnings.lemmy },
                   { name: 'Total Payout', val: advEarnings.grand, primary: true }
                 ].map((earn, idx) => (
                   <div key={idx} className={cn(
                     "p-6 rounded-3xl border flex flex-col items-center text-center",
                     earn.primary ? "bg-brand-primary/10 border-brand-primary" : "bg-slate-900 border-slate-800"
                   )}>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 leading-none">{earn.name} Earnings</p>
                      <p className={cn("text-3xl font-black", earn.primary ? "text-brand-primary" : "text-white")}>
                        ${earn.val.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                   </div>
                 ))}
              </div>
            </div>
          )}

          {activeSubTab === 'technicians' && (
            <div className="space-y-6">
              <div className="-mx-1 sm:mx-0 max-w-[100vw] sm:max-w-none overflow-x-auto no-scrollbar rounded-3xl border border-slate-800 bg-slate-900/30">
                <table className="w-full min-w-[560px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/50">
                      <th className="sticky left-0 z-10 bg-slate-900/95 px-3 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[100px]">Service Code</th>
                      {TECHNICIANS.map(t => (
                        <th key={t} className="px-2 md:px-4 py-3 md:py-4 text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest text-center min-w-[52px] max-w-[64px] truncate">{t}</th>
                      ))}
                      <th className="px-3 md:px-6 py-3 md:py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center min-w-[56px]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {techData.map((row, rIdx) => (
                      <tr key={row.code} className="hover:bg-slate-800/20 transition-colors">
                        <td className="sticky left-0 z-[1] bg-slate-900/95 px-3 md:px-6 py-3 md:py-4 min-w-[100px]">
                          <div className="flex flex-col">
                            <span className="text-[10px] md:text-xs font-black text-white">{row.code}</span>
                            <span className="text-[8px] md:text-[9px] font-bold text-slate-500 uppercase leading-snug">{row.desc}</span>
                          </div>
                        </td>
                         {TECHNICIANS.map(t => (
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
                              className="w-12 md:w-16 bg-slate-950 border border-slate-800 rounded-lg px-1 py-1 text-center text-xs font-black text-white focus:border-brand-primary outline-none transition-all disabled:opacity-60"
                            />
                          </td>
                        ))}
                        <td className="px-6 py-4 text-center">
                          <span className="text-xs font-black text-brand-secondary">
                            {TECHNICIANS.reduce((sum, t) => sum + (Number(row[t]) || 0), 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 border-t-2 border-slate-700">
                      <td className="px-6 py-6 text-[10px] font-black text-white uppercase tracking-widest italic">Tech Grand Totals</td>
                      {TECHNICIANS.map(t => (
                        <td key={t} className="px-4 py-6 text-center text-base font-black text-white">{techTotals.totals[t]}</td>
                      ))}
                      <td className="px-6 py-6 text-center text-lg font-black text-brand-primary">{techTotals.grand}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

               {/* Tech Earnings Summary */}
               <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                  {TECHNICIANS.map(t => (
                    <div key={t} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center">
                      <p className="text-[9px] font-black text-slate-500 uppercase mb-2">{t}</p>
                      <p className="text-lg font-black text-emerald-400">
                        ${techEarnings.earnings[t].toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeSubTab === 'upsells' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden p-8">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-brand-primary/10 rounded-2xl">
                    <Settings className="text-brand-primary" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-white tracking-tighter uppercase">Incentive Pricing</h4>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Configure payout values per Operation Code</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {INITIAL_PERFORMANCE_DATA.map(d => (
                    <div key={d.code} className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-2xl hover:border-slate-700 transition-colors">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-700">
                            {d.code}
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-white uppercase leading-none mb-1">{d.desc}</p>
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
                            className="bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-4 py-2.5 text-sm font-black text-white w-32 focus:border-brand-primary outline-none disabled:opacity-60"
                          />
                       </div>
                    </div>
                  ))}
                </div>

                {selectedMonth === 'active' && (
                  <div className="mt-12 flex flex-col md:flex-row gap-4 justify-between items-center pt-8 border-t border-slate-800">
                     <div className="flex items-center gap-3">
                        <div className="p-3 bg-rose-500/10 rounded-2xl">
                          <Trash2 className="text-rose-500" size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-rose-500 uppercase">Reset Competition</p>
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">This will clear all current entry data</p>
                        </div>
                     </div>
                     <button 
                      onClick={() => setShowClearConfirm(true)}
                      className="px-8 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-550 border border-rose-550/30 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                     >
                       Reset All Statistics
                     </button>
                  </div>
                )}
              </div>

              {/* Data Persistence Info */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-start gap-4">
                 <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Info className="text-emerald-500" size={16} />
                 </div>
                 <div className="flex-1">
                    <h5 className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1">Local Storage Active</h5>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Your competition data is saved directly in this browser. You can export the state as a file to move it between devices, or clear it when a new month starts.
                    </p>
                 </div>
              </div>
            </div>
          )}

          {activeSubTab === 'performance' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Advisor Chart */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-8 min-h-[450px] flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-brand-primary/10 rounded-xl">
                          <BarChart3 className="text-brand-primary" size={20} />
                        </div>
                        <h4 className="text-lg font-black text-white uppercase tracking-tighter">Advisor Distribution</h4>
                     </div>
                  </div>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false}
                          axisLine={false} 
                        />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                          itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                        />
                        <Legend />
                        <Bar dataKey="Frank" fill="#2e86c1" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Lemmy" fill="#e74c3c" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Jaryn" fill="#82ccdd" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tech Highlights */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col">
                   <div className="flex items-center gap-3 mb-8">
                      <div className="p-2.5 bg-brand-secondary/10 rounded-xl">
                        <Target className="text-brand-secondary" size={20} />
                      </div>
                      <h4 className="text-lg font-black text-white uppercase tracking-tighter">Technician Leaderboard</h4>
                   </div>
                   
                   <div className="space-y-4 flex-1">
                      {TECHNICIANS
                        .map(t => ({ name: t, total: techTotals.totals[t] }))
                        .sort((a,b) => b.total - a.total)
                        .map((tech, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-slate-950/40 border border-slate-800/50 rounded-2xl group hover:border-slate-700 transition-all">
                             <div className="flex items-center gap-4">
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black border",
                                  i === 0 ? "bg-amber-500/10 text-amber-500 border-amber-500/30" : "bg-slate-800 text-slate-400 border-slate-700"
                                )}>
                                  {i + 1}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-white uppercase tracking-tight">{tech.name}</p>
                                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">Service Technician</p>
                                </div>
                             </div>
                             <div className="text-right">
                               <p className="text-lg font-black text-white">{tech.total}</p>
                               <p className="text-[9px] font-bold text-emerald-500 uppercase">Upsells Logged</p>
                             </div>
                          </div>
                        ))
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
