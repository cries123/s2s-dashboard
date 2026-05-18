import React, { useState, useEffect } from 'react';
import { 
  FileUp, TrendingUp, Users, DollarSign, Clock, Loader2, CheckCircle2, ChevronRight, BarChart3, Target, ChevronDown, X 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';

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
}

export const AdvisorPerformance: React.FC<AdvisorPerformanceProps> = ({ currentDealershipId }) => {
  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [expandedAdvisors, setExpandedAdvisors] = useState<Record<string, boolean>>({});
  const [advisors, setAdvisors] = useState<AdvisorData[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [laborTarget, setLaborTarget] = useState(500000);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch Dealership Settings (for target)
  useEffect(() => {
    if (!currentDealershipId) return;
    const settingsRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings', currentDealershipId);
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setLaborTarget(docSnap.data().laborGrossTarget || 500000);
      }
    });
    return () => unsubscribe();
  }, [currentDealershipId]);

  // realtime performance sync
  useEffect(() => {
    if (!user || !currentDealershipId) return;

    const docId = currentDealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${currentDealershipId}`;
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.advisors) setAdvisors(data.advisors);
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
  }, [user, currentDealershipId]);

  const saveToFirestore = async (data: { advisors: AdvisorData[], totals: any }) => {
    if (!user || !currentDealershipId) return;
    const docId = currentDealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${currentDealershipId}`;
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    try {
      await setDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
    } catch (error) {
      console.error('Error saving advisor performance:', error);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus(null);
    
    try {
      const pdfBase64 = await fileToBase64(file);
      
      const response = await fetch('/api/parse-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to analyze productivity report');
      }

      const data = await response.json();
      await saveToFirestore(data);
      setImportStatus({ type: 'success', message: 'Productivity report imported successfully!' });
      
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
    
    // If totals object is missing but we have advisors, compute it
    if (!baseTotals && advisors.length > 0) {
      baseTotals = {
        totalGross: advisors.reduce((a, b) => a + (b.grossLabor || 0), 0),
        totalLabor: advisors.reduce((a, b) => a + (b.laborSold || 0), 0),
        totalParts: advisors.reduce((a, b) => a + (b.partsSold || 0), 0),
        totalGrossParts: advisors.reduce((a, b) => a + (b.grossParts || 0), 0),
        totalSales: advisors.reduce((a, b) => a + (b.totalSales || 0), 0),
        totalHrs: advisors.reduce((a, b) => a + (b.hrsSold || 0), 0),
      };
    }

    if (!baseTotals) return null;

    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const elapsedDays = today.getDate();
    
    // Pace calculation
    const avgDailyGross = (baseTotals.totalGross || 0) / Math.max(1, elapsedDays);
    const grossForecast = Math.round(avgDailyGross * daysInMonth);
    const grossPace = Math.round(avgDailyGross * elapsedDays);
    
    const avgDailySales = (baseTotals.totalSales || 0) / Math.max(1, elapsedDays);
    const salesForecast = Math.round(avgDailySales * daysInMonth);
    const salesPace = Math.round(avgDailySales * elapsedDays);

    const avgDailyParts = (baseTotals.totalParts || 0) / Math.max(1, elapsedDays);
    const partsForecast = Math.round(avgDailyParts * daysInMonth);
    const partsPace = Math.round(avgDailyParts * elapsedDays);

    const avgDailyGrossParts = (baseTotals.totalGrossParts || 0) / Math.max(1, elapsedDays);
    const grossPartsForecast = Math.round(avgDailyGrossParts * daysInMonth);
    const grossPartsPace = Math.round(avgDailyGrossParts * elapsedDays);

    return {
      ...baseTotals,
      grossForecast,
      grossPace,
      salesForecast,
      salesPace,
      partsForecast,
      partsPace,
      grossPartsForecast,
      grossPartsPace,
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
      
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-brand-secondary" />
            Advisor Performance Tracking
          </h3>
          <p className="text-slate-500 text-xs mt-1 uppercase tracking-widest font-black">Labor & Profitability Analysis from CSR Report</p>
        </div>
        
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary text-white hover:bg-brand-primary/90 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50"
        >
          {isImporting ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
          Import PDF Productivity Report
        </button>
      </div>

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
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Labor Sales MTD Box */}
              <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-3xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Labor Sales MTD</p>
                <p className="text-2xl font-black text-white">${metrics.totalLabor.toLocaleString()}</p>
                <div className="flex items-center justify-between mt-2 text-[10px] font-bold text-slate-500">
                  <span className="uppercase italic">Avg: ${(metrics.totalLabor / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/Day</span>
                </div>
              </div>

              {/* Gross Labor Box */}
              <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-3xl">
                <p className="text-[10px] font-black text-brand-secondary uppercase tracking-widest mb-1">Gross Labor MTD</p>
                <p className="text-2xl font-black text-white">${metrics.totalGross.toLocaleString()}</p>
                <div className="flex items-center justify-between mt-2 text-[10px] font-bold text-slate-500">
                  <span className="uppercase italic">Avg: ${(metrics.totalGross / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/Day</span>
                </div>
              </div>

              {/* Part Sales Box */}
              <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-3xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Part Sales MTD</p>
                <p className="text-2xl font-black text-white">${(metrics.totalParts || 0).toLocaleString()}</p>
                <div className="flex items-center justify-between mt-2 text-[10px] font-bold text-slate-500">
                  <span className="uppercase italic">Avg: ${(metrics.totalParts / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/Day</span>
                </div>
              </div>

              {/* Gross Part Sales Box */}
              <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-3xl">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Gross Parts MTD</p>
                <p className="text-2xl font-black text-white">${(metrics.totalGrossParts || 0).toLocaleString()}</p>
                <div className="flex items-center justify-between mt-2 text-[10px] font-bold text-slate-500">
                   <span className="uppercase italic">GP: {Math.round(((metrics.totalGrossParts || 0) / (metrics.totalParts || 1)) * 100)}%</span>
                </div>
              </div>

              {/* Department Total Box */}
              <div className="p-5 bg-gradient-to-br from-brand-primary/20 to-brand-primary/5 border border-brand-primary/30 rounded-3xl">
                <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Store Throughput</p>
                <p className="text-2xl font-black text-white">${metrics.totalSales.toLocaleString()}</p>
                <div className="flex items-center justify-between mt-2 text-[10px] font-bold text-brand-primary/60">
                   <div className="flex items-center gap-1">
                     <TrendingUp size={10} className={metrics.totalSales >= metrics.salesPace ? "text-emerald-500" : "text-rose-500"} />
                     <span className="uppercase">Pace: ${metrics.salesPace.toLocaleString()}</span>
                   </div>
                   <span className="uppercase italic">Avg: ${(metrics.totalSales / Math.max(1, metrics.elapsedDays)).toLocaleString(undefined, {maximumFractionDigits: 0})}/Day</span>
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
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Labor Efficiency</p>
                         </div>
                         <p className="text-sm font-black text-white">{advisor.gpPercent}% GP</p>
                       </div>
                       <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                         <div className={cn(
                           "h-full transition-all duration-1000 shadow-[0_0_8px_rgba(var(--brand-primary-rgb),0.5)]",
                           advisor.gpPercent > 80 ? "bg-emerald-500" : advisor.gpPercent > 60 ? "bg-brand-primary" : "bg-rose-500"
                         )} style={{ width: `${advisor.gpPercent}%` }}></div>
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
                                    <p className="text-[10px] font-black text-white leading-none mb-1">{item.description}</p>
                                    <p className="text-[8px] font-bold text-brand-secondary uppercase tracking-tighter">Labour: ${item.revenue.toFixed(2)}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                    {item.count} Sold
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
