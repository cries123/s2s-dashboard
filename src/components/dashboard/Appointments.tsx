import React, { useState, useEffect } from 'react';
import { 
  collection, doc, setDoc, onSnapshot, serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { User, DailyStat } from '../../types';
import { 
  ChevronLeft, ChevronRight, Save, Loader2, TrendingUp, Calendar as CalendarIcon, 
  BarChart3, Target, Clock
} from 'lucide-react';

interface AppointmentsProps {
  currentUser: User;
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

export default function Appointments({ currentUser, onSuccess, onError }: AppointmentsProps) {
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
    const path = 'artifacts/hyundai-sales-to-service/public/data/appointmentTracker';
    const q = collection(db, path);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyStat));
      setAllStats(stats);
      
      const currentStat = stats.find(s => s.date === selectedDate);
      setDailyCount(currentStat ? currentStat.count.toString() : '');
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [selectedDate]);

  const handleSave = async () => {
    let countNum = parseInt(dailyCount);
    if (isNaN(countNum)) countNum = 0;
    
    setSaving(true);
    const path = `artifacts/hyundai-sales-to-service/public/data/appointmentTracker/${selectedDate}`;
    try {
      await setDoc(doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'appointmentTracker', selectedDate), {
        date: selectedDate,
        count: countNum,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });
      onSuccess?.(`Recorded ${countNum} appointments for ${selectedDate}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSaving(false);
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

    return { 
      monthTotal, 
      weekTotal, 
      forecast, 
      avgDaily: avgDaily.toFixed(1),
      daysRemaining: daysInMonth - elapsedDays,
      weekStats
    };
  };

  const metrics = calculateMetrics();

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
    if (count < 20) return 'bg-amber-500/10 border-amber-500/30 text-amber-500';
    if (count >= 20 && count <= 25) return 'bg-green-500/10 border-green-500/30 text-green-500';
    return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400';
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card-base p-8 bg-gradient-to-br from-brand-primary/20 to-slate-900 border-brand-primary/30 col-span-1 lg:col-span-2">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-brand-primary rounded-2xl flex items-center justify-center shadow-lg shadow-brand-primary/20">
              <TrendingUp className="text-white" size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">Month-End Projection</h2>
              <p className="text-slate-400 font-medium mt-1">Real-time forecasting based on current monthly velocity.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            <div>
              <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em] mb-2">Estimated Volume</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black text-white">{metrics.forecast}</span>
                <span className="text-xs font-bold text-slate-500 uppercase">Units</span>
              </div>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">Daily Average</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-200">{metrics.avgDaily}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Per Day</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">Month Status</p>
              <div className="badge badge-success px-4 py-1.5">{metrics.daysRemaining} Days Left</div>
            </div>
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
                className="w-full btn-primary h-14 flex items-center justify-center gap-2"
               >
                 {saving ? <Loader2 className="animate-spin" size={20} /> : <><Save size={18} /> Record Count</>}
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
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div><span className="text-slate-500">Below ({"<"}20)</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div><span className="text-slate-500">Target (20-25)</span></div>
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div><span className="text-slate-500">Surplus ({">"}25)</span></div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {weekDays.map((day) => (
            <button
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              className={`card-base p-5 flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] border-2 ${
                selectedDate === day.date ? 'ring-2 ring-brand-primary ring-offset-4 ring-offset-slate-950' : ''
              } ${getStatusColor(day.count, day.hasData)}`}
            >
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{day.label}</span>
              <span className="text-3xl font-black">{day.count}</span>
              <span className="text-[10px] font-bold opacity-60">{day.dayNum} {day.monthLabel}</span>
            </button>
          ))}
        </div>
      </div>

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
