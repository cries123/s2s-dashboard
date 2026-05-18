import React, { useState, useEffect } from 'react';
import { 
  collection, doc, setDoc, onSnapshot, serverTimestamp, query, where, deleteField 
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { User, DailyStat } from '../../types';
import { 
  ChevronLeft, ChevronRight, Save, Loader2, TrendingUp, TrendingDown, Calendar as CalendarIcon, 
  BarChart3, Target, Clock, FileUp, X, PieChart
} from 'lucide-react';
import { AdvisorPerformance } from './AdvisorPerformance';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

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
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  });
  const [dailyCount, setDailyCount] = useState<string>('');
  const [allStats, setAllStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [targetValue, setTargetValue] = useState(20);
  const [laborTarget, setLaborTarget] = useState(500000);
  const [partsTarget, setPartsTarget] = useState(50000);
  const [mtdGross, setMtdGross] = useState(0);
  const [mtdPartsGross, setMtdPartsGross] = useState(0);
  const [mtdLaborSales, setMtdLaborSales] = useState(0);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState<DailyStat | null>(null);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentDealershipId) return;

    // Fetch Settings
    const settingsRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'dealershipSettings', currentDealershipId);
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTargetValue(data.appointmentTarget || 20);
        setLaborTarget(data.laborGrossTarget || 500000);
        setPartsTarget(data.partsGrossTarget || 50000);
      }
    });

    // Fetch Performance for Gross Tracking
    const docId = currentDealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${currentDealershipId}`;
    const perfRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    const unsubPerf = onSnapshot(perfRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        
        // Use totals object if available (AI extracted), else fall back to sum
        if (data.totals) {
          setMtdGross(data.totals.totalGross || 0);
          setMtdPartsGross(data.totals.totalGrossParts || 0);
          setMtdLaborSales(data.totals.totalLabor || 0);
        } else {
          const rawAdvisors = data.advisors || [];
          const totalGross = rawAdvisors.reduce((acc: number, curr: any) => acc + (curr.grossLabor || curr.laborGross || 0), 0);
          const totalLabor = rawAdvisors.reduce((acc: number, curr: any) => acc + (curr.laborSold || 0), 0);
          const totalPartsGross = rawAdvisors.reduce((acc: number, curr: any) => acc + (curr.grossParts || 0), 0);
          setMtdGross(totalGross);
          setMtdLaborSales(totalLabor);
          setMtdPartsGross(totalPartsGross);
        }
      }
    });

    return () => {
      unsubSettings();
      unsubPerf();
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
    const isAdminUser = currentUser.role === 'admin';
    
    // For non-admins, Firestore REQUIRES the query to match the security rules.
    // If rules say you can only see your dealership, you MUST query with that filter.
    const q = isAdminUser 
      ? collection(db, path)
      : query(collection(db, path), where('dealershipId', '==', currentDealershipId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let stats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyStat));
      
      // Filter by dealershipId, allowing legacy data (no id) in Hyundai view
      stats = stats.filter(s => {
        if (currentDealershipId === 'hyundai') {
          return !s.dealershipId || s.dealershipId === 'hyundai';
        }
        return s.dealershipId === currentDealershipId;
      });

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
    let countNum = parseInt(dailyCount);
    if (isNaN(countNum)) countNum = 0;
    
    setSaving(true);
    const path = `artifacts/hyundai-sales-to-service/public/data/appointmentTracker/${selectedDate}`;
    try {
      await setDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentTracker', selectedDate), {
        date: selectedDate,
        count: countNum,
        dealershipId: currentDealershipId || 'hyundai',
        breakdown: deleteField(),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      }, { merge: true });
      onSuccess?.(`Recorded ${countNum} appointments for ${selectedDate}. Breakdown reset.`);
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

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPdf(true);
    
    try {
      const pdfBase64 = await fileToBase64(file);
      
      const response = await fetch('/api/parse-appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to parse report');
      }

      const rawData = await response.json();
      
      const breakdown = {
        diagnosis: rawData.diagnosis || 0,
        oilChange: rawData.oilChange || 0,
        recall: rawData.recall || 0,
        misc: rawData.misc || 0
      };

      const totalCount = rawData.total || Object.values(breakdown).reduce((a, b) => a + b, 0);

      await setDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentTracker', selectedDate), {
        date: selectedDate,
        count: totalCount,
        dealershipId: currentDealershipId || 'hyundai',
        breakdown,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      }, { merge: true });
      
      setDailyCount(totalCount.toString());
      onSuccess?.(`AI Parsing Success: Identified ${totalCount} appointments.`);
    } catch (err: any) {
      console.error("PDF Parse Error:", err);
      onError?.(err.message || "Failed to analyze PDF report.");
    } finally {
      setIsUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const calculateMetrics = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Month Stats
    const monthStats = allStats.filter(s => {
      const d = new Date(s.date + 'T00:00:00');
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const monthTotal = monthStats.reduce((acc, s) => acc + s.count, 0);
    
    // Week Stats (Monday start)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
    startOfWeek.setHours(0, 0, 0, 0);
    
    const weekStats = allStats.filter(s => {
      const d = new Date(s.date + 'T00:00:00');
      return d >= startOfWeek;
    });
    const weekTotal = weekStats.reduce((acc, s) => acc + s.count, 0);

    // Forecasting
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const elapsedDays = today.getDate();
    const avgDaily = elapsedDays > 0 ? monthTotal / elapsedDays : 0;
    const forecast = Math.round(avgDaily * daysInMonth);

    // PACE TRACKING
    const dailyTarget = targetValue;
    const monthTarget = dailyTarget * daysInMonth;
    const paceTarget = Math.round(dailyTarget * elapsedDays);
    
    // Variance from Pace (The "Lost Opportunity" if negative, "Surplus" if positive)
    const mtdVariance = monthTotal - paceTarget;
    const lostOpportunity = mtdVariance < 0 ? Math.abs(mtdVariance) : 0;
    
    // Current Monthly Shortfall (Goal - Current)
    const currentShortfall = Math.max(0, monthTarget - monthTotal);
    
    // Projected Shortfall (Goal - Forecast)
    const projectedShortfall = monthTarget - forecast;

    // PROJECTED SALES SHORTFALLS & FORECASTS
    const laborDailyAvg = elapsedDays > 0 ? mtdGross / elapsedDays : 0;
    const laborSalesDailyAvg = elapsedDays > 0 ? mtdLaborSales / elapsedDays : 0;
    const grossPaceTarget = Math.round((laborTarget / daysInMonth) * elapsedDays);
    const grossForecast = Math.round(laborDailyAvg * daysInMonth);
    const laborSalesForecast = Math.round(laborSalesDailyAvg * daysInMonth);
    const grossVariance = mtdGross - grossPaceTarget;
    
    // PARTS FORECAST
    const partsDailyAvg = elapsedDays > 0 ? mtdPartsGross / elapsedDays : 0;
    const partsPaceTarget = Math.round((partsTarget / daysInMonth) * elapsedDays);
    const partsForecast = Math.round(partsDailyAvg * daysInMonth);
    const partsVariance = mtdPartsGross - partsPaceTarget;

    return { 
      monthTotal, 
      weekTotal, 
      forecast, 
      avgDaily: avgDaily.toFixed(1),
      daysRemaining: daysInMonth - elapsedDays,
      lostOpportunity,
      mtdVariance,
      projectedShortfall,
      currentShortfall,
      weekStats,
      dailyTarget,
      monthTarget,
      paceTarget,
      // Sales metrics
      mtdGross,
      mtdLaborSales,
      laborTarget,
      grossForecast,
      laborSalesForecast,
      grossPaceTarget,
      grossVariance,
      laborDailyAvg,
      laborSalesDailyAvg,
      // Parts metrics
      mtdPartsGross,
      partsForecast,
      partsPaceTarget,
      partsTarget,
      partsDailyAvg,
      partsVariance
    };
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
      const dateStr = d.toISOString().split('T')[0];
      const stat = allStats.find(s => s.date === dateStr);
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

  const getStatusColor = (count: number, hasData: boolean) => {
    if (!hasData && count === 0) return 'bg-slate-900 border-slate-800 text-slate-600';
    if (count < targetValue) return 'bg-rose-500/10 border-rose-500/30 text-rose-500';
    if (count === targetValue) return 'bg-orange-500/10 border-orange-500/30 text-orange-500';
    return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500';
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Forecasting Hero */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="badge badge-primary px-3 py-1 flex items-center gap-2">
            <Target size={12} />
            <span className="text-[10px] font-black uppercase tracking-widest">Active Daily Goal: {targetValue} Units</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card-base p-8 bg-gradient-to-br from-brand-primary/20 to-slate-900 border-brand-primary/30 col-span-1 lg:col-span-2 relative">
          <div className="absolute top-3 right-4">
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 whitespace-nowrap shadow-sm shadow-emerald-500/5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{metrics.daysRemaining} Days Left</span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-8 mt-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/20 flex items-center justify-center text-brand-primary shadow-lg shadow-brand-primary/10">
                <TrendingUp size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight uppercase">Month-End Projections</h2>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Real-time forecasting based on current monthly velocity.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            {/* KPI MATRIX */}
            {[
              { 
                label: 'Labor Gross', 
                current: metrics.mtdGross,
                daily: metrics.laborDailyAvg, 
                forecast: metrics.grossForecast, 
                target: metrics.laborTarget, 
                isCurrency: true,
                color: 'text-brand-secondary'
              },
              { 
                label: 'Parts Gross', 
                current: metrics.mtdPartsGross,
                daily: metrics.partsDailyAvg, 
                forecast: metrics.partsForecast, 
                target: metrics.partsTarget, 
                isCurrency: true,
                color: 'text-emerald-400'
              },
              { 
                label: 'Appt Volume', 
                current: metrics.monthTotal,
                daily: Number(metrics.avgDaily), 
                forecast: metrics.forecast, 
                target: metrics.monthTarget, 
                isCurrency: false,
                color: 'text-white'
              }
            ].map((kpi, idx) => (
              <div key={idx} className="relative group">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  {/* LABEL & FORECAST (The Result) */}
                  <div className="w-full md:w-1/3">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{kpi.label} Forecast</p>
                    <div className="flex items-baseline gap-2">
                      <span className={cn("text-4xl font-black leading-none", kpi.color)}>
                        {kpi.isCurrency ? `$${Math.round(kpi.forecast).toLocaleString()}` : Math.round(kpi.forecast).toLocaleString()}
                      </span>
                      {kpi.forecast < kpi.target && (
                        <span className="text-[10px] font-black text-rose-500 uppercase tracking-tight">
                          -{kpi.isCurrency ? `$${Math.round(kpi.target - kpi.forecast).toLocaleString()}` : Math.round(kpi.target - kpi.forecast)} trend loss
                        </span>
                      )}
                    </div>
                  </div>

                  {/* STATS STRIP */}
                  <div className="flex-1 grid grid-cols-3 gap-8 md:gap-12 items-end">
                    {/* CURRENT MTD */}
                    <div className="flex flex-col">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 opacity-70">Current MTD</p>
                      <p className="text-xl font-black text-white">
                        {kpi.isCurrency ? `$${Math.round(kpi.current).toLocaleString()}` : Math.round(kpi.current).toLocaleString()}
                      </p>
                    </div>

                    {/* DAILY PACE */}
                    <div className="flex flex-col">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 opacity-70">Daily Pace</p>
                      <p className="text-xl font-black text-white">
                        {kpi.isCurrency ? `$${Math.round(kpi.daily).toLocaleString()}` : kpi.daily.toFixed(1)}
                      </p>
                    </div>

                    {/* TARGET */}
                    <div className="flex flex-col text-right">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 opacity-70">Monthly Goal</p>
                      <p className="text-xl font-black text-slate-300">
                        {kpi.isCurrency ? `$${Math.round(kpi.target).toLocaleString()}` : Math.round(kpi.target).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* VISUAL BAR */}
                <div className="mt-4 h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (kpi.forecast / Math.max(1, kpi.target)) * 100)}%` }}
                    className={cn(
                      "h-full transition-all duration-1000",
                      kpi.forecast >= kpi.target ? "bg-emerald-500" : "bg-brand-primary"
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-base p-8 flex flex-col justify-between bg-slate-900 border-slate-800">
           <div>
             <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
               <Clock size={16} className="text-brand-primary" /> Daily Entry
             </h4>
             
             <div className="space-y-4">
               <div>
                 <label className="input-label !mb-2">Operational Date</label>
                 <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-4 py-2">
                   <button onClick={handlePrevDay} className="text-slate-500 hover:text-white transition-colors"><ChevronLeft size={18} /></button>
                   <input 
                     type="date" 
                     value={selectedDate} 
                     onChange={e => setSelectedDate(e.target.value)}
                     className="bg-transparent border-none text-white text-sm font-bold w-full text-center focus:ring-0"
                   />
                   <button onClick={handleNextDay} className="text-slate-500 hover:text-white transition-colors"><ChevronRight size={18} /></button>
                 </div>
               </div>
               
               <div>
                 <label className="input-label !mb-2">Total Appointments</label>
                 <input 
                   type="number"
                   value={dailyCount}
                   onChange={e => setDailyCount(e.target.value)}
                   placeholder="0"
                   className="input-field text-2xl font-black text-center h-16 bg-slate-950 border-slate-800 focus:border-brand-primary"
                 />
               </div>

               <button 
                onClick={handleSave}
                disabled={saving}
                className="w-full btn-primary h-14 flex items-center justify-center gap-2 mb-3"
               >
                 {saving ? <Loader2 className="animate-spin" size={20} /> : <><Save size={18} /> Record Count</>}
               </button>

               <div className="relative">
                 <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
                 <div className="relative flex justify-center text-[10px] uppercase font-black"><span className="bg-slate-900 px-3 text-slate-500">Or Smart Import</span></div>
               </div>

               <input type="file" ref={pdfInputRef} onChange={handlePdfUpload} accept=".pdf" className="hidden" />
               <button 
                 onClick={() => pdfInputRef.current?.click()}
                 disabled={isUploadingPdf}
                 className="w-full mt-3 h-12 flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all disabled:opacity-50"
               >
                 {isUploadingPdf ? <Loader2 className="animate-spin" size={14} /> : <FileUp size={14} />}
                 Import Appt Details PDF
               </button>
             </div>
           </div>
        </div>
      </div>

      {/* Weekly Visual Calendar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 whitespace-nowrap">
              <CalendarIcon size={20} className="text-brand-primary" /> Weekly Performance Grid
            </h3>
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1">
              <button 
                onClick={() => setWeekOffset(prev => prev - 1)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all"
                title="Previous Week"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={() => setWeekOffset(0)}
                className="px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-widest"
              >
                Today
              </button>
              <button 
                onClick={() => setWeekOffset(prev => prev + 1)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all"
                title="Next Week"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div><span className="text-slate-500">Below ({targetValue})</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div><span className="text-slate-500">Target ({targetValue})</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div><span className="text-slate-500">Surplus ({targetValue}+)</span></div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {weekDays.map((day) => {
             const fullDayData = allStats.find(s => s.date === day.date);
             return (
               <button
                 key={day.date}
                 onClick={() => {
                   setSelectedDate(day.date);
                   if (fullDayData?.breakdown) {
                     setShowBreakdown(fullDayData);
                   }
                 }}
                 className={`card-base p-5 flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] border-2 relative group ${
                   selectedDate === day.date ? 'ring-2 ring-brand-primary ring-offset-4 ring-offset-slate-950' : ''
                 } ${getStatusColor(day.count, day.hasData)}`}
               >
                 {fullDayData?.breakdown && (
                   <div className="absolute top-2 right-2 text-emerald-500 opacity-40 group-hover:opacity-100 transition-opacity">
                     <PieChart size={10} />
                   </div>
                 )}
                 <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{day.label}</span>
                 <span className="text-3xl font-black">{day.count}</span>
                 <span className="text-[10px] font-bold opacity-60">{day.dayNum} {day.monthLabel}</span>
                 {fullDayData?.breakdown && (
                   <span className="text-[8px] font-black uppercase tracking-tighter text-emerald-500/60 group-hover:text-emerald-500">Breakdown Avail.</span>
                 )}
               </button>
             );
          })}
        </div>
      </div>

      {/* Breakdown Modal */}
      <AnimatePresence>
        {showBreakdown && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">Appointment Breakdown</h3>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                    {new Date(showBreakdown.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <button 
                  onClick={() => setShowBreakdown(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-brand-primary/10 border border-brand-primary/20 rounded-2xl">
                    <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">Total Appts</p>
                    <p className="text-3xl font-black text-white">{showBreakdown.count}</p>
                  </div>
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl font-black">
                     <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Efficiency Ratio</p>
                     <p className="text-3xl font-black text-white">{Math.round(((showBreakdown.breakdown?.oilChange || 0) + (showBreakdown.breakdown?.diagnosis || 0)) / (showBreakdown.count || 1) * 100)}%</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { label: 'Diagnosis / Sputtering', value: showBreakdown.breakdown?.diagnosis || 0, color: 'bg-brand-secondary', icon: 'DIAG' },
                    { label: 'Synthetic Oil Changes', value: showBreakdown.breakdown?.oilChange || 0, color: 'bg-emerald-500', icon: 'OIL' },
                    { label: 'Recalls & Campaigns', value: showBreakdown.breakdown?.recall || 0, color: 'bg-brand-primary', icon: 'RCL' },
                    { label: 'Miscellaneous / Other', value: showBreakdown.breakdown?.misc || 0, color: 'bg-slate-700', icon: 'MISC' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 group">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-[8px] font-black text-white shadow-lg", item.color)}>
                        {item.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-end mb-1.5">
                          <span className="text-[10px] font-black text-white uppercase tracking-widest">{item.label}</span>
                          <span className="text-xs font-black text-slate-300">{item.value} Units</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.value / showBreakdown.count) * 100}%` }}
                            className={cn("h-full", item.color)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-slate-500 italic text-center font-bold uppercase tracking-widest pt-4">
                  *Categorization based on PDF text analysis logic
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Aggregated Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card-base p-8 bg-slate-900 border-slate-800 flex items-center gap-8">
           <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400">
             <CalendarIcon size={32} />
           </div>
           <div>
             <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Month-To-Date Total</p>
             <h3 className="text-4xl font-black text-white">{metrics.monthTotal}</h3>
             <p className="text-xs font-bold text-emerald-500 mt-1 uppercase">Total appointments logged this month</p>
           </div>
        </div>

        <div className="card-base p-8 bg-slate-900 border-slate-800 flex items-center gap-8">
           <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center text-brand-primary">
             <BarChart3 size={32} />
           </div>
           <div>
             <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Weekly Volume</p>
             <h3 className="text-4xl font-black text-white">{metrics.weekTotal}</h3>
             <p className="text-xs font-bold text-brand-primary mt-1 uppercase">Total appointments logged this week</p>
           </div>
        </div>
      </div>

      {/* Advisor Performance Tracking */}
      <AdvisorPerformance currentDealershipId={currentDealershipId} />

      <div className="card-base p-10 bg-slate-950 border-dashed border-slate-800 text-center">
        <Target size={40} className="text-slate-700 mx-auto mb-6" />
        <h3 className="text-xl font-bold text-slate-300">Operational Intelligence</h3>
        <p className="text-slate-500 max-w-md mx-auto mt-2 italic text-sm">
          Tracking daily appointment counts allows the S2S Dashboard to project shop capacity and retail throughput targets. 
        </p>
      </div>
    </div>
  );
}
