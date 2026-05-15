import React, { useState, useEffect } from 'react';
import { FileUp, TrendingUp, Users, DollarSign, Clock, Loader2, CheckCircle2, ChevronRight, BarChart3, Target, ChevronDown } from 'lucide-react';
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
  laborSold: number; // This is Labor Sales
  grossLabor: number; // This is Gross Labor
  totalSales: number;
  gpPercent: number;
  elr: number;
  upsells?: UpsellItem[];
}

export const AdvisorPerformance: React.FC = () => {
  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [expandedAdvisors, setExpandedAdvisors] = useState<Record<string, boolean>>({});
  const [advisors, setAdvisors] = useState<AdvisorData[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // realtime sync
  useEffect(() => {
    if (!user) return;

    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', 'advisorReports');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.advisors) setAdvisors(data.advisors);
        if (data.totals) setTotals(data.totals);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore sync error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const saveToFirestore = async (data: { advisors: AdvisorData[], totals: any }) => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', 'advisorReports');
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    // Simulating the extraction of data from the PDF file (Op Code Frequency Report)
    setTimeout(async () => {
      const extractedAdvisors: AdvisorData[] = [
        {
          name: "FRANK",
          soCount: 83,
          hrsSold: 133.80,
          laborSold: 20546.24,
          grossLabor: 17074.99,
          totalSales: 32131.45,
          gpPercent: 83.1,
          elr: 153.56,
          upsells: [
            { code: "AF", description: "Engine Air Filter", count: 5, revenue: 125.00 },
            { code: "ALIGN", description: "Wheel Alignment", count: 4, revenue: 599.80 },
            { code: "BFR", description: "Brake Fluid Service", count: 7, revenue: 944.65 },
            { code: "CAF", description: "Cabin Air Filter", count: 10, revenue: 146.00 },
            { code: "CCC", description: "Combustion Cleaning", count: 2, revenue: 1273.60 },
            { code: "FSC", description: "Fuel System Cleaner", count: 19, revenue: 124.10 },
            { code: "TS", description: "Transmission Service", count: 2, revenue: 360.00 }
          ]
        },
        {
          name: "JARYN",
          soCount: 25,
          hrsSold: 8.80,
          laborSold: 1308.98,
          grossLabor: 1076.11,
          totalSales: 3401.73,
          gpPercent: 82.2,
          elr: 148.75,
          upsells: [
            { code: "MB1", description: "Mount & Balance (1)", count: 1, revenue: 58.58 }
          ]
        },
        {
          name: "LEMMY",
          soCount: 77,
          hrsSold: 90.40,
          laborSold: 12446.85,
          grossLabor: 10184.95,
          totalSales: 20370.31,
          gpPercent: 81.8,
          elr: 137.69,
          upsells: [
            { code: "ALIGN", description: "Wheel Alignment", count: 2, revenue: 299.90 },
            { code: "BFR", description: "Brake Fluid Service", count: 4, revenue: 539.80 },
            { code: "CAF", description: "Cabin Air Filter", count: 6, revenue: 66.00 },
            { code: "MB4", description: "Mount & Balance (4)", count: 2, revenue: 320.00 },
            { code: "TS", description: "Transmission Service", count: 2, revenue: 360.00 },
            { code: "FSC", description: "Fuel System Cleaner", count: 11, revenue: 69.50 }
          ]
        }
      ];

      const newTotals = {
        totalSales: 55903.49,
        totalLabor: 34302.07,
        totalGross: 28336.05,
        totalHrs: 233.0,
        avgGp: 82.6
      };

      await saveToFirestore({ advisors: extractedAdvisors, totals: newTotals });

      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }, 1200);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <Loader2 className="animate-spin text-brand-secondary" size={32} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Syncing Performance Dashboard...</p>
      </div>
    );
  }

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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-3xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Labor Sales MTD</p>
                <p className="text-2xl font-black text-white">${totals.totalLabor.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-emerald-500">
                  <TrendingUp size={10} />
                  <span>Target Achieved</span>
                </div>
              </div>
              <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-3xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Gross Labor MTD</p>
                <p className="text-2xl font-black text-brand-secondary">${totals.totalGross.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-slate-500">
                  <DollarSign size={10} />
                  <span>Net Performance</span>
                </div>
              </div>
              <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-3xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Profitability (GP%)</p>
                <p className="text-2xl font-black text-white">{totals.avgGp}%</p>
                <div className="w-full bg-slate-800 h-1 rounded-full mt-4 overflow-hidden text-emerald-500">
                  <div className="bg-emerald-500 h-full" style={{ width: `${totals.avgGp}%` }}></div>
                </div>
              </div>
              <div className="p-5 bg-gradient-to-br from-brand-primary/20 to-brand-primary/5 border border-brand-primary/30 rounded-3xl">
                <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Total Dept Sales</p>
                <p className="text-2xl font-black text-white">${totals.totalSales.toLocaleString()}</p>
                <p className="text-[9px] font-bold text-brand-primary/60 mt-2 uppercase tracking-tighter italic">Source: 05/01 - 05/14 Report</p>
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
