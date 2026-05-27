import React, { useState, useEffect } from 'react';
import { 
  collection, doc, setDoc, onSnapshot, serverTimestamp, query, where, deleteField 
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { User, DailyStat } from '../../../types';
import { logSystemAction } from '../../../services/loggingService';
import { extractTextFromPDF } from '../../../utils/pdfExtractor';
import { 
  ChevronLeft, ChevronRight, Save, Loader2, TrendingUp, TrendingDown, Calendar as CalendarIcon, 
  BarChart3, Target, Clock, FileUp, X, PieChart
} from 'lucide-react';
import { AdvisorPerformance } from '../analytics/AdvisorPerformance';
import { cn } from '../../../lib/utils';
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
  const [partsTarget, setPartsTarget] = useState(300000);
  const [mtdGross, setMtdGross] = useState(0);
  const [mtdPartsGross, setMtdPartsGross] = useState(0);
  const [mtdLaborSales, setMtdLaborSales] = useState(0);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState<DailyStat | null>(null);
  const [showManualBreakdownEntry, setShowManualBreakdownEntry] = useState(false);
  const [manualBreakdown, setManualBreakdown] = useState({
    diagnosis: 0,
    oilChange: 0,
    recall: 0,
    misc: 0
  });
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
        setPartsTarget(data.partsSalesTarget || 300000);
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
          setMtdPartsGross(data.totals.totalGrossParts || data.totals.totalPartsGross || 0);
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
    
    // Default manual breakdown to match total count if no specific breakdown is entered yet
    // But since we want to ask them, we'll open the modal first
    setManualBreakdown({
      diagnosis: 0,
      oilChange: 0,
      recall: 0,
      misc: 0
    });
    setShowManualBreakdownEntry(true);
  };

  const confirmManualSave = async () => {
    const totalCount = Object.values(manualBreakdown).reduce((a, b) => (a as number) + (b as number), 0) as number;
    
    setSaving(true);
    const path = `artifacts/hyundai-sales-to-service/public/data/appointmentTracker/${selectedDate}`;
    try {
      await setDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentTracker', selectedDate), {
        date: selectedDate,
        count: totalCount,
        dealershipId: currentDealershipId || 'hyundai',
        breakdown: manualBreakdown,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      }, { merge: true });
      
      await logSystemAction(
        "Appointments Updated",
        `Updated scheduled appointment count to ${totalCount} for date ${selectedDate} with customized service breakdown`,
        'appointments',
        currentUser.email,
        currentUser.username,
        currentUser.dealershipId
      );
      
      setDailyCount(totalCount.toString());
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

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPdf(true);
    
    try {
      const reportText = await extractTextFromPDF(file);
      
      const response = await fetch('/api/parse-appointments', {
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

      let rawData;
      try {
        rawData = await response.json();
      } catch (e) {
        console.error('Failed to parse successful response as JSON:', e);
        throw new Error('Server returned an invalid data format. Please try again.');
      }
      
      const breakdown = {
        diagnosis: rawData.diagnosis || 0,
        oilChange: rawData.oilChange || 0,
        recall: rawData.recall || 0,
        misc: rawData.misc || 0
      };

      // Ensure total count matches the sum of breakdown to avoid confusion
      const sumBreakdown = Object.values(breakdown).reduce((a, b) => a + b, 0);
      const totalCount = sumBreakdown > 0 ? sumBreakdown : (rawData.total || 0);

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

    // Working days (Monday to Friday only) calculations
    let totalWorkingDays = 0;
    let elapsedWorkingDays = 0;
    let remainingWorkingDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentYear, currentMonth, d);
      const dayOfWeek = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
      
      if (isWorkingDay) {
        totalWorkingDays++;
        if (d <= elapsedDays) {
          elapsedWorkingDays++;
        } else {
          remainingWorkingDays++;
        }
      }
    }

    // Help guard against division by zero on the 1st day/weekend
    const activeElapsedWorkingDays = elapsedWorkingDays > 0 ? elapsedWorkingDays : 1;

    // Use working days average to project remaining working days
    const avgDaily = activeElapsedWorkingDays > 0 ? monthTotal / activeElapsedWorkingDays : 0;
    const forecast = Math.round(monthTotal + (avgDaily * remainingWorkingDays));

    // PACE TRACKING (Based on Working Days in Month)
    const dailyTarget = targetValue;
    const monthTarget = dailyTarget * totalWorkingDays;
    const paceTarget = Math.round(dailyTarget * elapsedWorkingDays);
    
    // Variance from Pace (The "Lost Opportunity" if negative, "Surplus" if positive)
    const mtdVariance = monthTotal - paceTarget;
    const lostOpportunity = mtdVariance < 0 ? Math.abs(mtdVariance) : 0;
    
    // Current Monthly Shortfall (Goal - Current)
    const currentShortfall = Math.max(0, monthTarget - monthTotal);
    
    // Projected Shortfall (Goal - Forecast)
    const projectedShortfall = monthTarget - forecast;

    // PROJECTED SALES SHORTFALLS & FORECASTS (Using working days)
    const laborDailyAvg = activeElapsedWorkingDays > 0 ? mtdGross / activeElapsedWorkingDays : 0;
    const laborSalesDailyAvg = activeElapsedWorkingDays > 0 ? mtdLaborSales / activeElapsedWorkingDays : 0;
    const grossPaceTarget = Math.round((laborTarget / totalWorkingDays) * elapsedWorkingDays);
    const grossForecast = Math.round(mtdGross + (laborDailyAvg * remainingWorkingDays));
    const laborSalesForecast = Math.round(mtdLaborSales + (laborSalesDailyAvg * remainingWorkingDays));
    const grossVariance = mtdGross - grossPaceTarget;
    
    // PARTS FORECAST (Using working days)
    const partsDailyAvg = activeElapsedWorkingDays > 0 ? mtdPartsGross / activeElapsedWorkingDays : 0;
    const partsPaceTarget = Math.round((partsTarget / totalWorkingDays) * elapsedWorkingDays);
    const partsForecast = Math.round(mtdPartsGross + (partsDailyAvg * remainingWorkingDays));
    const partsVariance = mtdPartsGross - partsPaceTarget;

    return { 
      monthTotal, 
      weekTotal, 
      forecast, 
      avgDaily: avgDaily.toFixed(1),
      daysRemaining: remainingWorkingDays,
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
      mtdPartsGross,
      laborTarget,
      grossForecast,
      laborSalesForecast,
      grossPaceTarget,
      grossVariance,
      laborDailyAvg,
      laborSalesDailyAvg,
      // Parts metrics
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
      {/* Forecasting Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
        <div>
          <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest block mb-1">Performance Dynamics</span>
          <h1 className="text-2xl font-black text-white uppercase tracking-wider">Appointment & Gross Forecast</h1>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <div className="bg-brand-primary/10 border border-brand-primary/20 rounded-xl px-4 py-2 flex items-center gap-2.5 shadow-sm">
            <Target size={14} className="text-brand-primary animate-pulse" />
            <span className="text-xs font-black uppercase tracking-wider text-white">Daily Goal: {targetValue} Units</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MONTH-END PROJECTIONS CARD */}
        <div className="bg-slate-950/40 border border-white/5 backdrop-blur-xl p-8 rounded-3xl col-span-1 lg:col-span-2 relative shadow-2xl overflow-hidden group">
          {/* Subtle Background Glows */}
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-brand-primary/10 rounded-full blur-[100px] pointer-events-none group-hover:bg-brand-primary/15 transition-all duration-700" />
          <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-brand-secondary/5 rounded-full blur-[100px] pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shadow-lg shadow-brand-primary/5">
                <TrendingUp size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-white tracking-wider uppercase">Month-End Projections</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Real-time forecasting based on remaining working days velocity.</p>
              </div>
            </div>
            <div className="self-start sm:self-auto">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 whitespace-nowrap shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">{metrics.daysRemaining} Working Days Left</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6 relative z-10">
            {/* KPI MATRIX */}
            {[
              { 
                label: 'Labor Gross MTD', 
                current: metrics.mtdGross,
                daily: metrics.laborDailyAvg, 
                forecast: metrics.grossForecast, 
                target: metrics.laborTarget, 
                isCurrency: true,
                color: 'text-brand-secondary',
                barColor: 'bg-gradient-to-r from-brand-primary to-brand-secondary',
                glowColor: 'shadow-brand-primary/20'
              },
              { 
                label: 'Parts Gross MTD', 
                current: metrics.mtdPartsGross,
                daily: metrics.partsDailyAvg, 
                forecast: metrics.partsForecast, 
                target: metrics.partsTarget, 
                isCurrency: true,
                color: 'text-emerald-400',
                barColor: 'bg-gradient-to-r from-emerald-500 to-teal-400',
                glowColor: 'shadow-emerald-500/20'
              },
              { 
                label: 'Appt Volume', 
                current: metrics.monthTotal,
                daily: Number(metrics.avgDaily), 
                forecast: metrics.forecast, 
                target: metrics.monthTarget, 
                isCurrency: false,
                color: 'text-sky-400',
                barColor: 'bg-gradient-to-r from-sky-455 to-blue-400',
                glowColor: 'shadow-sky-400/20'
              }
            ].map((kpi, idx) => {
              const completionPercent = Math.min(100, Math.round((kpi.forecast / Math.max(1, kpi.target)) * 100));
              const isShortfall = kpi.forecast < kpi.target;
              
              return (
                <div key={idx} className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/[0.08] p-5 rounded-2xl transition-all duration-300 relative group/row">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    {/* LEFT: LABEL & PROJECTED FORECAST */}
                    <div className="w-full md:w-5/12">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{kpi.label} Forecast</span>
                        {isShortfall ? (
                          <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-450 border border-rose-500/25 px-1.5 py-0.5 rounded text-[8px] uppercase font-black tracking-tight shrink-0">
                            Shortfall
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[8px] uppercase font-black tracking-tight shrink-0">
                            On Track
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={cn("text-3xl font-black leading-none tracking-tight", kpi.color)}>
                          {kpi.isCurrency ? `$${Math.round(kpi.forecast).toLocaleString()}` : Math.round(kpi.forecast).toLocaleString()}
                        </span>
                        {isShortfall && (
                          <span className="text-[10px] font-black text-rose-500 uppercase tracking-tighter">
                            -{kpi.isCurrency ? `$${Math.round(kpi.target - kpi.forecast).toLocaleString()}` : Math.round(kpi.target - kpi.forecast)} Trend Loss
                          </span>
                        )}
                      </div>
                    </div>

                    {/* RIGHT: STATS STRIP */}
                    <div className="flex-1 grid grid-cols-3 gap-4 items-center border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                      {/* CURRENT MTD */}
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Current MTD</span>
                        <span className="text-base font-black text-white">
                          {kpi.isCurrency ? `$${Math.round(kpi.current).toLocaleString()}` : Math.round(kpi.current).toLocaleString()}
                        </span>
                      </div>

                      {/* DAILY PACE */}
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Pace Velocity</span>
                        <span className="text-base font-black text-white">
                          {kpi.isCurrency ? `$${Math.round(kpi.daily).toLocaleString()}` : kpi.daily.toFixed(1)} <span className="text-[9px] text-slate-500 font-bold">/D</span>
                        </span>
                      </div>

                      {/* GOAL */}
                      <div className="flex flex-col text-right">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Monthly Goal</span>
                        <span className="text-base font-black text-slate-300">
                          {kpi.isCurrency ? `$${Math.round(kpi.target).toLocaleString()}` : Math.round(kpi.target).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* VISUAL METERS & PERCENTAGE COMPLETION */}
                  <div className="mt-5">
                    <div className="flex justify-between items-center mb-1.5 text-[9px] font-bold text-slate-400">
                      <span className="text-slate-500">Projected Run Rate Progress</span>
                      <span className="font-mono text-white/90">{completionPercent}% of Goal</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden relative border border-white/[0.02]">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${completionPercent}%` }}
                        className={cn("h-full transition-all duration-1000 rounded-full relative", kpi.barColor)}
                      >
                        <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/35 blur-xs rounded-full"></div>
                      </motion.div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DAILY ENTRY CARD */}
        <div className="bg-slate-950/45 border border-white/5 backdrop-blur-xl p-8 rounded-3xl flex flex-col justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-40 h-40 bg-brand-primary/5 rounded-full blur-[50px] pointer-events-none" />
          
          <div className="relative z-10 w-full">
            <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2.5">
              <Clock size={16} className="text-brand-primary" /> Daily Control Console
            </h4>
            
            <div className="space-y-5">
              {/* OPERATIONAL DATE SELECTION */}
              <div>
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider block mb-2">Target Operations Date</label>
                <div className="flex items-center justify-between bg-slate-900/85 border border-white/5 rounded-2xl px-3 py-1.5 shadow-inner">
                  <button 
                    onClick={handlePrevDay} 
                    className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white border border-white/5 hover:border-white/10 transition-all duration-200 cursor-pointer text-xs flex items-center justify-center shrink-0"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)}
                    className="bg-transparent border-none text-white text-sm font-black w-full text-center focus:ring-0 cursor-pointer outline-none select-none tracking-wide"
                  />
                  <button 
                    onClick={handleNextDay} 
                    className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white border border-white/5 hover:border-white/10 transition-all duration-200 cursor-pointer text-xs flex items-center justify-center shrink-0"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              
              {/* TOTAL SCHED RECTOR */}
              <div>
                <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider block mb-2">Daily Scheduled Volume</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={dailyCount}
                    onChange={e => setDailyCount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-white/5 hover:border-white/10 focus:border-brand-primary rounded-2xl text-3xl font-black text-center py-4 text-white focus:ring-4 focus:ring-brand-primary/10 transition-all duration-250 outline-none"
                  />
                </div>
              </div>

              {/* SAVE BUTTON */}
              <button 
                onClick={handleSave}
                disabled={saving}
                className="w-full h-14 bg-gradient-to-r from-brand-primary to-brand-secondary hover:brightness-110 active:scale-[0.98] text-white text-xs font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/30 transition-all duration-200 cursor-pointer"
              >
                {saving ? (
                  <Loader2 className="animate-spin text-white" size={18} />
                ) : (
                  <>
                    <Save size={16} className="text-white" />
                    Record Count Breakouts
                  </>
                )}
              </button>

              {/* SECTION SPLITTER */}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                <div className="relative flex justify-center text-[8px] uppercase font-black tracking-widest"><span className="bg-[#0a0f1d] px-3 text-slate-500">Document Processing</span></div>
              </div>

              {/* SMART PDF IMPORT */}
              <input type="file" ref={pdfInputRef} onChange={handlePdfUpload} accept=".pdf" className="hidden" />
              <button 
                onClick={() => pdfInputRef.current?.click()}
                disabled={isUploadingPdf}
                className="w-full h-12 flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 hover:border-emerald-500/35 text-emerald-400 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 cursor-pointer disabled:opacity-50 shadow-inner"
              >
                {isUploadingPdf ? <Loader2 className="animate-spin" size={14} /> : <FileUp size={14} />}
                Extract Daily Schedule PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Visual Calendar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/20 p-5 rounded-2xl border border-white/[0.03]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2.5">
              <CalendarIcon size={18} className="text-brand-primary" /> 
              Weekly Performance Grid
            </h3>
            <div className="flex items-center bg-slate-900/90 border border-white/5 rounded-xl p-1 shadow-inner">
              <button 
                onClick={() => setWeekOffset(prev => prev - 1)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-200 cursor-pointer"
                title="Previous Week"
              >
                <ChevronLeft size={14} />
              </button>
              <button 
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1 text-[9px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-colors cursor-pointer"
              >
                Today
              </button>
              <button 
                onClick={() => setWeekOffset(prev => prev + 1)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-200 cursor-pointer"
                title="Next Week"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div><span>Below ({targetValue})</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div><span>Target ({targetValue})</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span>Surplus ({targetValue}+)</span></div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {weekDays.map((day) => {
             const fullDayData = allStats.find(s => s.date === day.date);
             const isSelected = selectedDate === day.date;
             return (
               <button
                 key={day.date}
                 onClick={() => {
                   setSelectedDate(day.date);
                   if (fullDayData?.breakdown) {
                     setShowBreakdown(fullDayData);
                   }
                 }}
                 className={cn(
                   "backdrop-blur-md rounded-2xl p-5 flex flex-col items-center justify-center gap-1.5 transition-all duration-300 hover:scale-[1.03] border relative group cursor-pointer",
                   isSelected 
                     ? "ring-2 ring-brand-primary ring-offset-2 ring-offset-[#020617] bg-white/[0.04]" 
                     : "bg-[#0c1120]/45",
                   getStatusColor(day.count, day.hasData)
                 )}
               >
                 {fullDayData?.breakdown && (
                   <div className="absolute top-2.5 right-2.5 text-emerald-400 opacity-50 group-hover:opacity-100 transition-opacity">
                     <PieChart size={12} />
                   </div>
                 )}
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">{day.label}</span>
                 <span className="text-3xl font-black tracking-tight my-0.5 leading-none">{day.count}</span>
                 <span className="text-[9px] font-bold tracking-tight opacity-70">{day.dayNum} {day.monthLabel}</span>
                 {fullDayData?.breakdown && (
                   <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400/80 group-hover:text-emerald-400 mt-1 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                     Details
                   </span>
                 )}
               </button>
             );
          })}
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

      {/* Aggregated Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
        <div className="bg-slate-950/40 border border-white/5 p-8 rounded-3xl flex items-center gap-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/[0.02] rounded-full blur-[40px]" />
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/5 group-hover:scale-105 transition-transform duration-300">
            <CalendarIcon size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Month-To-Date Active</p>
            <h3 className="text-3xl font-black text-white leading-none tracking-tight">{metrics.monthTotal}</h3>
            <p className="text-[10px] font-bold text-emerald-500/80 mt-1.5 uppercase tracking-wide">Total scheduled visits recorded this month</p>
          </div>
        </div>

        <div className="bg-slate-950/40 border border-white/5 p-8 rounded-3xl flex items-center gap-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/[0.02] rounded-full blur-[40px]" />
          <div className="w-14 h-14 bg-brand-primary/10 border border-brand-primary/20 rounded-2xl flex items-center justify-center text-brand-primary shrink-0 shadow-lg shadow-brand-primary/5 group-hover:scale-105 transition-transform duration-300">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Weekly Active Volume</p>
            <h3 className="text-3xl font-black text-white leading-none tracking-tight">{metrics.weekTotal}</h3>
            <p className="text-[10px] font-bold text-brand-primary/80 mt-1.5 uppercase tracking-wide">Total scheduled visits recorded this week</p>
          </div>
        </div>
      </div>

      {/* Advisor Performance Tracking */}
      <AdvisorPerformance currentDealershipId={currentDealershipId} />
    </div>
  );
}
