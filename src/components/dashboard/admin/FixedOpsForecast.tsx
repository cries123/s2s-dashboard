import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  TrendingUp, 
  Calendar, 
  Users, 
  Clock, 
  DollarSign, 
  Printer, 
  FileText, 
  RefreshCw, 
  Percent, 
  AlertCircle, 
  CheckCircle,
  HelpCircle,
  Play
} from 'lucide-react';
import { cn } from '../../../lib/utils';

interface FixedOpsForecastProps {
  currentDealershipId?: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

interface ForecastInputs {
  daysInMonth: number;
  techsAvailable: number;
  hoursPerDay: number;
  absenteeismRate: number; // e.g., 0.05
  efficiencyForecast: number; // e.g., 1.0
  cpMix: number; // e.g., 0.49
  warrMix: number; // e.g., 0.34
  internalMix: number; // e.g., 0.17
  cpRate: number;
  warrRate: number;
  internalRate: number;
  cpGp: number; // e.g., 0.75 for 75%
  warrGp: number; // e.g., 0.70 for 70%
  internalGp: number; // e.g., 0.60 for 60%
  subletSales: number;
  subletGrossProfit: number;
  miscSales: number;
  miscGrossProfit: number;
  unappliedTime: number;
}

export function calculateFixedOpsForecast(inputs: ForecastInputs) {
  // 1. Capacity Rounding Updates
  const rawHours = inputs.daysInMonth * inputs.techsAvailable * inputs.hoursPerDay;
  const lostHours = rawHours * inputs.absenteeismRate;
  const projectedHours = rawHours - lostHours;
  const netProjectedHours = projectedHours * inputs.efficiencyForecast;

  // 2. Labor Sales Mix Matrix Rows
  const cpHours = netProjectedHours * inputs.cpMix;
  const cpSales = cpHours * inputs.cpRate;
  const cpGrossProfit = cpSales * inputs.cpGp;

  const warrHours = netProjectedHours * inputs.warrMix;
  const warrSales = warrHours * inputs.warrRate;
  const warrGrossProfit = warrSales * inputs.warrGp;

  const internalHours = netProjectedHours * inputs.internalMix;
  const internalSales = internalHours * inputs.internalRate;
  const internalGrossProfit = internalSales * inputs.internalGp;

  // Total Row Summary Outputs
  const totalLaborSales = cpSales + warrSales + internalSales;
  const totalLaborGrossProfit = cpGrossProfit + warrGrossProfit + internalGrossProfit;
  const blendedELR = netProjectedHours > 0 ? totalLaborSales / netProjectedHours : 0;
  const blendedGPPercent = totalLaborSales > 0 ? totalLaborGrossProfit / totalLaborSales : 0;

  // 3. Final Fixed Ops Summary Block
  const totalServiceSales = totalLaborSales + inputs.subletSales + inputs.miscSales;
  const totalServiceGrossProfit = totalLaborGrossProfit + inputs.subletGrossProfit + inputs.miscGrossProfit;
  const adjustedTotalGrossProfit = totalServiceGrossProfit - inputs.unappliedTime;

  return {
    rawHours,
    lostHours,
    projectedHours,
    netProjectedHours,
    cpHours, 
    warrHours, 
    internalHours,
    cpSales, 
    warrSales, 
    internalSales,
    cpGrossProfit,
    warrGrossProfit,
    internalGrossProfit,
    totalLaborSales,
    totalLaborGrossProfit,
    blendedELR,
    blendedGPPercent,
    totalServiceSales,
    totalServiceGrossProfit,
    adjustedTotalGrossProfit
  };
}

export default function FixedOpsForecast({ 
  currentDealershipId = 'hyundai', 
  onSuccess, 
  onError 
}: FixedOpsForecastProps) {
  const [liveDbMetrics, setLiveDbMetrics] = useState({
    laborSales: 0,
    laborGross: 0,
    hoursSold: 0,
    roCount: 0,
    elr: 0,
    advisorCount: 0,
    loaded: false
  });

  // Forecasting Inputs state - initialized to beautiful, realistic balanced defaults
  const [inputs, setInputs] = useState<ForecastInputs>({
    daysInMonth: 22,
    techsAvailable: 7,
    hoursPerDay: 8,
    absenteeismRate: 0.05,
    efficiencyForecast: 1.0,
    cpMix: 0.49,
    cpRate: 185,
    cpGp: 0.75,
    warrMix: 0.34,
    warrRate: 175,
    warrGp: 0.70,
    internalMix: 0.17,
    internalRate: 160,
    internalGp: 0.60,
    subletSales: 12500,
    subletGrossProfit: 3125,
    miscSales: 5680,
    miscGrossProfit: 1420,
    unappliedTime: 0
  });

  const [hasRunForecast, setHasRunForecast] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    monCount: '4',
    tueCount: '4',
    wedCount: '4',
    thuCount: '5',
    friCount: '5',
    techsAvailable: '7',
    hoursPerDay: '8',               // Default: 8
    absenteeismRate: '5',           // Default: 5%
    efficiencyForecast: '100',      // Default: 100%
    cpMix: '49',
    cpRate: '185',
    cpGp: '75',
    warrMix: '34',
    warrRate: '175',
    warrGp: '70',
    internalMix: '17',
    internalRate: '160',
    internalGp: '60',
    subletSales: '12500',
    subletGrossProfit: '3125',
    miscSales: '5680',
    miscGrossProfit: '1420',
    unappliedTime: '0'
  });

  const [activePreset, setActivePreset] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);

  // Sync Live Telemetry Performance variables MTD
  useEffect(() => {
    const docId = currentDealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${currentDealershipId}`;
    const docRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'performance', docId);
    
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let totalLabor = 0;
        let totalGross = 0;
        let totalHrs = 0;
        let totalRos = 0;
        let advCount = 0;

        if (data.totals) {
          totalLabor = data.totals.totalLabor || 0;
          totalGross = data.totals.totalGross || 0;
          totalHrs = data.totals.totalHrs || 0;
          totalRos = data.totals.totalSoCount || data.totals.totalSo || 0;
        }

        const advisors = data.advisors || [];
        advCount = advisors.length;
        
        if (!data.totals && advisors.length > 0) {
          totalLabor = advisors.reduce((a: number, b: any) => a + (Number(b.laborSold) || 0), 0);
          totalGross = advisors.reduce((a: number, b: any) => a + (Number(b.grossLabor) || 0), 0);
          totalHrs = advisors.reduce((a: number, b: any) => a + (Number(b.hrsSold) || 0), 0);
          totalRos = advisors.reduce((a: number, b: any) => a + (Number(b.soCount) || 0), 0);
        }

        const elrValue = totalHrs > 0 ? totalLabor / totalHrs : 0;

        setLiveDbMetrics({
          laborSales: totalLabor,
          laborGross: totalGross,
          hoursSold: totalHrs,
          roCount: totalRos,
          elr: elrValue,
          advisorCount: advCount,
          loaded: true
        });

        // Smart Hydration: Stop automatic/placeholder hydration of state variables on load per specification.
      } else {
        setLiveDbMetrics({
          laborSales: 0,
          laborGross: 0,
          hoursSold: 0,
          roCount: 0,
          elr: 0,
          advisorCount: 0,
          loaded: true
        });
      }
    }, (err) => {
      console.error("Error loading performance data for forecast MTD state:", err);
      onError?.("Unable to load current month performance variables.");
    });

    return () => unsubscribe();
  }, [currentDealershipId, onError]);

  // Synchronize draft states when the setup modal opens
  useEffect(() => {
    if (showFormModal) {
      if (hasRunForecast) {
        setDraft({
          monCount: '4',
          tueCount: '4',
          wedCount: '4',
          thuCount: '5',
          friCount: '5',
          techsAvailable: String(inputs.techsAvailable || ''),
          hoursPerDay: String(inputs.hoursPerDay),
          absenteeismRate: String(inputs.absenteeismRate * 100),
          efficiencyForecast: String(inputs.efficiencyForecast * 100),
          cpMix: String(inputs.cpMix * 100),
          cpRate: String(inputs.cpRate || ''),
          cpGp: String(inputs.cpGp * 100),
          warrMix: String(inputs.warrMix * 100),
          warrRate: String(inputs.warrRate || ''),
          warrGp: String(inputs.warrGp * 100),
          internalMix: String(inputs.internalMix * 100),
          internalRate: String(inputs.internalRate || ''),
          internalGp: String(inputs.internalGp * 100),
          subletSales: String(inputs.subletSales || ''),
          subletGrossProfit: String(inputs.subletGrossProfit || ''),
          miscSales: String(inputs.miscSales || ''),
          miscGrossProfit: String(inputs.miscGrossProfit || ''),
          unappliedTime: String(inputs.unappliedTime || ''),
        });
      } else {
        setDraft({
          monCount: '',
          tueCount: '',
          wedCount: '',
          thuCount: '',
          friCount: '',
          techsAvailable: '',
          hoursPerDay: '8',               // Default: 8
          absenteeismRate: '5',           // Default: 5%
          efficiencyForecast: '100',      // Default: 100%
          cpMix: '',
          cpRate: '',
          cpGp: '',
          warrMix: '',
          warrRate: '',
          warrGp: '',
          internalMix: '',
          internalRate: '',
          internalGp: '',
          subletSales: '',
          subletGrossProfit: '',
          miscSales: '',
          miscGrossProfit: '',
          unappliedTime: ''
        });
      }
      setValidationError(null);
    }
  }, [showFormModal, hasRunForecast, inputs]);

  // Adjust parameters via presets
  const applyPreset = (preset: 'conservative' | 'balanced' | 'aggressive') => {
    setActivePreset(preset);
    if (preset === 'conservative') {
      setInputs(prev => ({
        ...prev,
        absenteeismRate: 0.08,
        efficiencyForecast: 0.90,
        cpMix: 0.45,
        warrMix: 0.35,
        internalMix: 0.20
      }));
    } else if (preset === 'balanced') {
      setInputs(prev => ({
        ...prev,
        absenteeismRate: 0.05,
        efficiencyForecast: 1.00,
        cpMix: 0.49,
        warrMix: 0.34,
        internalMix: 0.17
      }));
    } else if (preset === 'aggressive') {
      setInputs(prev => ({
        ...prev,
        absenteeismRate: 0.02,
        efficiencyForecast: 1.15,
        cpMix: 0.55,
        warrMix: 0.30,
        internalMix: 0.15
      }));
    }
  };

  // Perform calculations
  const results = calculateFixedOpsForecast(inputs);

  // Auto equilibrium to ensure labor mix sums up to 100%
  const autoNormalizeMix = () => {
    const totalMix = inputs.cpMix + inputs.warrMix + inputs.internalMix;
    if (totalMix === 0) {
      setInputs(prev => ({ ...prev, cpMix: 0.50, warrMix: 0.30, internalMix: 0.20 }));
      return;
    }
    // Re-scale so that total is exactly 1.0
    setInputs(prev => ({
      ...prev,
      cpMix: Number((prev.cpMix / totalMix).toFixed(2)),
      warrMix: Number((prev.warrMix / totalMix).toFixed(2)),
      internalMix: Number((1 - (prev.cpMix / totalMix) - (prev.warrMix / totalMix)).toFixed(2))
    }));
    onSuccess?.("Labor Mix percentages normalized to exactly 100%!");
  };

  const handleInputChange = (field: keyof ForecastInputs, val: number) => {
    setInputs(prev => ({
      ...prev,
      [field]: val
    }));
  };

  const isMixValid = Math.abs((inputs.cpMix + inputs.warrMix + inputs.internalMix) - 1) < 0.001;

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // Charts mapping
  const chartComparisonData = [
    {
      name: 'Labor Sales',
      'Current MTD': Math.round(liveDbMetrics.laborSales),
      'Projected Forecast': Number(results.totalLaborSales.toFixed(2)),
    },
    {
      name: 'Labor Gross',
      'Current MTD': Math.round(liveDbMetrics.laborGross),
      'Projected Forecast': Number(results.totalLaborGrossProfit.toFixed(2)),
    }
  ];

  const pieData = [
    { name: 'Customer Pay', value: results.cpSales, color: '#6366f1' },
    { name: 'Warranty', value: results.warrSales, color: '#3b82f6' },
    { name: 'Internal', value: results.internalSales, color: '#8b5cf6' },
  ];

  return (
    <div className="space-y-6">
      {/* Dynamic Print CSS Style injector */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-forecast-modal, #print-forecast-modal * {
            visibility: visible !important;
          }
          #print-forecast-modal {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            padding: 2.5cm !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      {/* Main Glass Header */}
      <div className="bg-brand-primary/5 ring-1 ring-brand-primary/10 p-6 rounded-3xl border border-brand-primary/30 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wider">Fixed Ops Financial Forecaster</h2>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button 
            onClick={() => setShowFormModal(true)}
            id="btn-trigger-forecast"
            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-brand-primary text-slate-950 hover:bg-brand-primary/95 hover:shadow-lg shadow-brand-primary/10 transition-all flex items-center gap-2 cursor-pointer font-bold"
          >
            <TrendingUp size={14} />
            Open Forecast Generator
          </button>
          <button 
            disabled={!hasRunForecast || !isMixValid}
            onClick={() => {
              setShowPrintModal(true);
            }}
            id="btn-trigger-preview-print"
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 border cursor-pointer",
              (hasRunForecast && isMixValid) 
                ? "bg-slate-900 border-slate-800 text-white hover:bg-slate-800"
                : "bg-slate-950/20 border-slate-900/50 text-slate-500 cursor-not-allowed"
            )}
          >
            <Printer size={14} />
            Preview & Print Report
          </button>
        </div>
      </div>

      {/* Bento Grid layout containing metrics comparing and sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: LIVE TELEMETRY MTD DATA (5 segments) */}
        <div className="lg:col-span-4 bg-slate-950/30 rounded-3xl border border-white/5 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
              <span className="text-xxs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live Telemetry MTD
              </span>
              <span className="text-xxs font-extrabold px-2 py-0.5 rounded-md bg-white/5 text-slate-400 uppercase tracking-wider">
                Current Month
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">MTD Gross Labor Sales</span>
                <p id="live-labor-sales" className="text-2xl font-black text-white mt-0.5">
                  ${liveDbMetrics.laborSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">MTD Labor Gross Profit</span>
                <p id="live-labor-gross" className="text-lg font-extrabold text-indigo-400 mt-0.5">
                  ${liveDbMetrics.laborGross.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Hours Sold</span>
                  <p id="live-hours" className="text-sm font-black text-slate-200 mt-0.5">
                    {liveDbMetrics.hoursSold.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Repair Orders</span>
                  <p id="live-ro-count" className="text-sm font-black text-slate-200 mt-0.5">
                    {liveDbMetrics.roCount} ROs
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Effective Labor Rate (ELR)</span>
                  <span className="text-xxs font-black text-brand-secondary bg-white/5 px-1.5 py-0.5 rounded">LIVE</span>
                </div>
                <p id="live-elr" className="text-lg font-black text-brand-secondary mt-0.5">
                  ${liveDbMetrics.elr.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: INTERACTIVE FORM CONTROLS (8 segments) */}
        <div className="lg:col-span-8 bg-[#0a0e1a]/50 rounded-3xl border border-white/5 p-6 space-y-6 relative overflow-hidden">
          {!hasRunForecast && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center text-center p-8 z-20 transition-all">
              <div className="p-4 bg-indigo-500/10 rounded-full border border-indigo-500/20 mb-3">
                <TrendingUp size={24} className="text-indigo-400" />
              </div>
              <h4 className="text-sm font-black text-white uppercase tracking-wider font-semibold">Forecasting Engine Offline</h4>
              <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
                The financial projection simulation is currently uninitialized. You must open and populate the setup template to run the EOM capacity calculations.
              </p>
              <button 
                onClick={() => setShowFormModal(true)}
                className="mt-5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-brand-primary text-slate-950 hover:bg-brand-primary/95 transition-all cursor-pointer shadow-lg shadow-brand-primary/10 flex items-center gap-2"
              >
                <TrendingUp size={14} />
                Generate Following Month Forecast
              </button>
            </div>
          )}
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-white/5 gap-3">
            <div>
              <span className="text-xxs font-bold uppercase tracking-widest text-slate-500">Forecasting Parameters</span>
              <h3 className="text-sm font-black text-white uppercase tracking-wider mt-0.5">Capacity & Rate Modifiers</h3>
            </div>
            
            {/* Presets segment controls */}
            <div className="flex bg-slate-950/60 p-0.5 rounded-xl border border-white/5 shrink-0">
              {(['conservative', 'balanced', 'aggressive'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xxs font-bold uppercase tracking-widest transition-all cursor-pointer",
                    activePreset === preset 
                      ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/10" 
                      : "text-slate-500 hover:text-slate-300 bg-transparent"
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            {/* Structural constants inputs */}
            <div className="space-y-4">
              <h4 className="text-xxs font-black text-brand-secondary uppercase tracking-widest flex items-center gap-1">
                <Users size={11} /> Capacity Constants
              </h4>

              <div className="space-y-3">
                {/* Days in Month */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <label className="text-slate-400 font-bold">Billing Days in Month</label>
                    <span className="font-mono text-white text-[11px] bg-slate-950 px-2 py-0.5 rounded">{inputs.daysInMonth} days</span>
                  </div>
                  <input 
                    type="range"
                    min="15"
                    max="31"
                    value={inputs.daysInMonth}
                    onChange={(e) => handleInputChange('daysInMonth', Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                {/* Techs Available */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <label className="text-slate-400 font-bold">Staffed Technicians</label>
                    <span className="font-mono text-white text-[11px] bg-slate-950 px-2 py-0.5 rounded">{inputs.techsAvailable} Techs</span>
                  </div>
                  <input 
                    type="range"
                    min="1"
                    max="30"
                    value={inputs.techsAvailable}
                    onChange={(e) => handleInputChange('techsAvailable', Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                {/* Hours Per Day */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <label className="text-slate-400 font-bold">Standard Shift Hours</label>
                    <span className="font-mono text-white text-[11px] bg-slate-950 px-2 py-0.5 rounded">{inputs.hoursPerDay} hrs/day</span>
                  </div>
                  <input 
                    type="range"
                    min="6"
                    max="12"
                    step="0.5"
                    value={inputs.hoursPerDay}
                    onChange={(e) => handleInputChange('hoursPerDay', Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                {/* Absenteeism Rate */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <label className="text-slate-400 font-bold">Absenteeism Factor</label>
                    <span className="font-mono text-rose-400 text-[11px] bg-rose-500/5 px-2 py-0.5 rounded font-bold">{(inputs.absenteeismRate * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="0.25"
                    step="0.01"
                    value={inputs.absenteeismRate}
                    onChange={(e) => handleInputChange('absenteeismRate', Number(e.target.value))}
                    className="w-full accent-rose-500"
                  />
                </div>

                {/* Efficiency Multiplier */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <label className="text-slate-400 font-bold">Shop Efficiency</label>
                    <span className="font-mono text-emerald-400 text-[11px] bg-emerald-500/5 px-2 py-0.5 rounded font-bold">{(inputs.efficiencyForecast * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0.70"
                    max="1.60"
                    step="0.05"
                    value={inputs.efficiencyForecast}
                    onChange={(e) => handleInputChange('efficiencyForecast', Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Target rates and channel ratios */}
            <div className="space-y-4">
              <h4 className="text-xxs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                <Percent size={11} /> Portfolio Yield & Mix
              </h4>

              <div className="space-y-4">
                {/* Mix indicators and adjuster */}
                <div className="p-3.5 bg-slate-950/60 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Labor Portfolio Mix Allocation</span>
                    <span className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded",
                      isMixValid ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                    )}>
                      {Math.round((inputs.cpMix + inputs.warrMix + inputs.internalMix) * 100)}% / 100%
                    </span>
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Customer Pay (CP)</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={inputs.cpMix}
                          onChange={(e) => handleInputChange('cpMix', Number(e.target.value))}
                          className="w-14 bg-slate-900 border border-white/5 rounded text-center text-white py-0.5 font-bold"
                        />
                        <span className="text-xxs text-slate-500">({Math.round(inputs.cpMix*100)}%)</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Warranty (Warr)</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={inputs.warrMix}
                          onChange={(e) => handleInputChange('warrMix', Number(e.target.value))}
                          className="w-14 bg-slate-900 border border-white/5 rounded text-center text-white py-0.5 font-bold"
                        />
                        <span className="text-xxs text-slate-500">({Math.round(inputs.warrMix*100)}%)</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Internal</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={inputs.internalMix}
                          onChange={(e) => handleInputChange('internalMix', Number(e.target.value))}
                          className="w-14 bg-slate-900 border border-white/5 rounded text-center text-white py-0.5 font-bold"
                        />
                        <span className="text-xxs text-slate-500">({Math.round(inputs.internalMix*100)}%)</span>
                      </div>
                    </div>
                  </div>

                  {!isMixValid && (
                    <div className="flex items-center justify-between gap-2 text-xxs text-rose-400 bg-rose-500/5 p-2 rounded-lg border border-rose-500/10 mt-1">
                      <div className="flex items-center gap-1.2">
                        <AlertCircle size={10} />
                        <span>Mix ratio sum must equal 100%!</span>
                      </div>
                      <button 
                        onClick={autoNormalizeMix}
                        className="text-[9px] bg-rose-500 text-white font-extrabold px-1.5 py-0.5 rounded cursor-pointer hover:bg-rose-400"
                      >
                        Auto-Normalize
                      </button>
                    </div>
                  )}
                </div>

                {/* Subcategory rates */}
                <div className="space-y-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hourly Target ELR ($)</span>
                  
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Customer Pay</span>
                      <input 
                        type="number" 
                        value={inputs.cpRate}
                        onChange={(e) => handleInputChange('cpRate', Number(e.target.value))}
                        className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-brand-primary text-center mt-1"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Warranty</span>
                      <input 
                        type="number" 
                        value={inputs.warrRate}
                        onChange={(e) => handleInputChange('warrRate', Number(e.target.value))}
                        className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-brand-secondary text-center mt-1"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Internal</span>
                      <input 
                        type="number" 
                        value={inputs.internalRate}
                        onChange={(e) => handleInputChange('internalRate', Number(e.target.value))}
                        className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-slate-300 text-center mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Target GP Margins */}
                <div className="space-y-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Target GP Margin (%)</span>
                  
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Customer Pay</span>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={Math.round(inputs.cpGp * 100)}
                        onChange={(e) => handleInputChange('cpGp', Number(e.target.value) / 100)}
                        className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-brand-primary text-center mt-1"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Warranty</span>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={Math.round(inputs.warrGp * 100)}
                        onChange={(e) => handleInputChange('warrGp', Number(e.target.value) / 100)}
                        className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-brand-secondary text-center mt-1"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Internal</span>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={Math.round(inputs.internalGp * 100)}
                        onChange={(e) => handleInputChange('internalGp', Number(e.target.value) / 100)}
                        className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-slate-300 text-center mt-1"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Sublet, Miscellaneous & Adjustments Block */}
          <div className="pt-4 border-t border-white/5 space-y-3">
            <h4 className="text-xxs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1">
              <DollarSign size={11} /> Sublet, Misc & Ledger Adjustments
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block">Sublet Sales ($)</label>
                <input 
                  type="number" 
                  value={inputs.subletSales}
                  onChange={(e) => handleInputChange('subletSales', Number(e.target.value))}
                  className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-white mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block">Sublet Gross ($)</label>
                <input 
                  type="number" 
                  value={inputs.subletGrossProfit}
                  onChange={(e) => handleInputChange('subletGrossProfit', Number(e.target.value))}
                  className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-indigo-400 mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block">Misc Sales ($)</label>
                <input 
                  type="number" 
                  value={inputs.miscSales}
                  onChange={(e) => handleInputChange('miscSales', Number(e.target.value))}
                  className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-white mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block">Misc Gross ($)</label>
                <input 
                  type="number" 
                  value={inputs.miscGrossProfit}
                  onChange={(e) => handleInputChange('miscGrossProfit', Number(e.target.value))}
                  className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-indigo-400 mt-1"
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] text-slate-300 uppercase font-bold block flex items-center justify-between">
                  <span>Unapplied ($)</span>
                  <span className="text-[9px] text-rose-500 font-bold">(Expense)</span>
                </label>
                <input 
                  type="number" 
                  value={inputs.unappliedTime}
                  onChange={(e) => handleInputChange('unappliedTime', Number(e.target.value))}
                  className="w-full bg-[#0d1324] border border-white/5 rounded-xl px-2.5 py-2 text-xs font-black text-rose-400 mt-1"
                />
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Forecaster Projections Overview Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-300">
        
        <div className="bg-[#0c1020]/90 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <Clock size={11} className="text-indigo-400" /> Max Raw Capacity
          </span>
          <div className="mt-2">
            <p className="text-xl font-black text-white">{hasRunForecast ? `${results.rawHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })} hrs` : '-- hrs'}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {hasRunForecast ? `${inputs.daysInMonth}d × ${inputs.techsAvailable}ts × ${inputs.hoursPerDay}h` : '--d × --ts × --h'}
            </p>
          </div>
        </div>

        <div className="bg-[#0c1020]/90 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <Percent size={11} className="text-emerald-400" /> Shop Efficiency Yield
          </span>
          <div className="mt-2">
            <p className="text-xl font-black text-emerald-400">{hasRunForecast ? `${results.netProjectedHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} hrs` : '-- hrs'}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 italic">
              Lost to Absenteeism: {hasRunForecast ? `-${results.lostHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} hrs` : '-- hrs'}
            </p>
          </div>
        </div>

        <div className="bg-[#0c1020]/90 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <DollarSign size={11} className="text-brand-primary" /> Projected Labor Sales
          </span>
          <div className="mt-2">
            <p className="text-xl font-black text-brand-primary">
              {hasRunForecast ? `$${results.totalLaborSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$--'}
            </p>
            <div className="text-[10px] text-slate-400 mt-1 flex flex-col gap-0.5">
              <span className="flex justify-between">
                <span>Labor GP:</span>
                <span className="font-bold text-indigo-400">
                  {hasRunForecast ? `$${results.totalLaborGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$--'}
                </span>
              </span>
              <span className="flex justify-between text-[9px] text-slate-500">
                <span>Blended GP %:</span>
                <span className="font-mono">{hasRunForecast ? `${Math.round(results.blendedGPPercent * 100)}%` : '--%'}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#0c1020]/90 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <TrendingUp size={11} className="text-brand-secondary" /> Forecast Blended ELR
          </span>
          <div className="mt-2">
            <p className="text-xl font-black text-brand-secondary">{hasRunForecast ? `$${results.blendedELR.toFixed(2)}` : '$--'}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Live baseline comparison: ${liveDbMetrics.elr.toFixed(2)}
            </p>
          </div>
        </div>

      </div>

      {/* Integrated Service Department EOM Summation Banner */}
      <div className="bg-slate-950/70 p-5 rounded-3xl border border-white/5 backdrop-blur-md animate-in fade-in duration-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-brand-primary/10 text-brand-primary border border-brand-primary/20 tracking-wider">
            Total Service Operations Consolidated Summation
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
          
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Total Service Department Sales</span>
              <p className="text-xl font-black text-white mt-1">
                {hasRunForecast ? `$${results.totalServiceSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$--'}
              </p>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 font-mono leading-none">
              Labor + Sublet + Misc
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-500/[0.02] border border-indigo-500/10 flex flex-col justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-350 tracking-wider block">Total Service Gross Profit</span>
              <p className="text-xl font-black text-indigo-400 mt-1">
                {hasRunForecast ? `$${results.totalServiceGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$--'}
              </p>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-mono leading-none">
              Labor GP + Sublet GP + Misc GP
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-brand-primary/[0.02] border border-brand-primary/10 flex flex-col justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-brand-primary tracking-wider block">Adjusted Total Gross Profit</span>
              <p className="text-xl font-black text-brand-primary mt-1">
                {hasRunForecast ? `$${results.adjustedTotalGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$--'}
              </p>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-mono leading-none">
              Service GP - Unapplied Hours/Expense
            </p>
          </div>

        </div>
      </div>

      {/* Visual Analytics Block using Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Compare Chart */}
        <div className="lg:col-span-2 bg-[#0a0e1a]/45 rounded-3xl border border-white/5 p-5 space-y-4 relative overflow-hidden">
          <div>
            <span className="text-xxs font-black text-slate-500 uppercase tracking-widest">Financial Yield Comparison</span>
            <h4 className="text-xs font-black text-white uppercase tracking-wider mt-0.5">Current vs Forecasted Labor Volume</h4>
          </div>

          <div className="h-64 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hasRunForecast ? chartComparisonData : chartComparisonData.map(d => ({ ...d, 'Projected Forecast': 0 }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#090d16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
                  itemStyle={{ fontSize: '11px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="Current MTD" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Projected Forecast" fill="#818cf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {!hasRunForecast && (
            <div className="absolute inset-0 bg-[#0a0e1af6] flex flex-col items-center justify-center text-center p-4 z-10 transition-all">
              <AlertCircle size={24} className="text-slate-500 mb-2" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visual Comparisons Locked</span>
              <p className="text-[10px] text-slate-500 max-w-[260px] mt-1">Please populate the structured input form first by clicking "Generate forecast" above to run the model.</p>
            </div>
          )}
        </div>

        {/* Mix Revenue Pie representation */}
        <div className="bg-[#0a0e1a]/45 rounded-3xl border border-white/5 p-5 space-y-4 flex flex-col justify-between relative overflow-hidden">
          <div>
            <span className="text-xxs font-black text-slate-500 uppercase tracking-widest">Revenue Mix Portfolio</span>
            <h4 className="text-xs font-black text-white uppercase tracking-wider mt-0.5">Projected Yield Shares</h4>
          </div>

          <div className="h-44 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={hasRunForecast ? pieData : pieData.map(d => ({ ...d, value: 0 }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Projected Sales']}
                  contentStyle={{ backgroundColor: '#090d16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
              <span className="text-xxs text-slate-400 font-bold uppercase tracking-wider">Total Projected</span>
              <span className="text-base font-black text-white">{hasRunForecast ? `$${results.totalLaborSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$--'}</span>
            </div>
          </div>

          <div className="space-y-2">
            {pieData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xxs font-bold">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span>{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white">{hasRunForecast ? `$${item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$--'}</span>
                  <span className="text-slate-500">({hasRunForecast ? `${Math.round((item.value / (results.totalLaborSales || 1)) * 100)}%` : '--%'})</span>
                </div>
              </div>
            ))}
          </div>
          {!hasRunForecast && (
            <div className="absolute inset-0 bg-[#0a0e1af6] flex flex-col items-center justify-center text-center p-4 z-10 transition-all">
              <AlertCircle size={24} className="text-slate-500 mb-2" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Share locked</span>
            </div>
          )}
        </div>

      </div>

      {/* QUICK FLOATING DIALOG INPUTS SUMMARY FORM MODAL */}
      {showFormModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 no-print animate-in fade-in duration-200">
          <div className="bg-[#0b0f19] border border-white/10 rounded-3xl p-6 max-w-xl w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">EOM Forecast Generator</h3>
                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">Configure next month's capacity parameters to construct the forecast models.</p>
              </div>
              <button 
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-white text-xs font-black cursor-pointer bg-white/5 h-6 w-6 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 text-xs overflow-y-auto max-h-[68vh] pr-1.5 scrollbar-thin scrollbar-thumb-white/10">
              
              {/* Validation alert if mix doesn't sum to 100% or other parameters mismatch */}
              {validationError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xxs text-rose-400 font-medium flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* 📅 SECTION 1: NEXT MONTH CAPACITY SETTINGS */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black text-brand-primary uppercase tracking-wider flex items-center gap-1 border-b border-white/5 pb-1">
                  📅 Next Month Capacity Settings
                </h4>
                
                {/* Weekday Count inputs */}
                <div>
                  <span className="text-slate-400 font-extrabold block mb-1.5 uppercase tracking-wider text-[10px]">Weekday Frequency Counts</span>
                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-1 text-center font-bold">Mon</label>
                      <input 
                        type="number"
                        min="0"
                        placeholder="0"
                        value={draft.monCount}
                        onChange={(e) => setDraft(prev => ({ ...prev, monCount: e.target.value }))}
                        className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-bold font-mono text-center text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-1 text-center font-bold">Tue</label>
                      <input 
                        type="number"
                        min="0"
                        placeholder="0"
                        value={draft.tueCount}
                        onChange={(e) => setDraft(prev => ({ ...prev, tueCount: e.target.value }))}
                        className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-bold font-mono text-center text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-1 text-center font-bold">Wed</label>
                      <input 
                        type="number"
                        min="0"
                        placeholder="0"
                        value={draft.wedCount}
                        onChange={(e) => setDraft(prev => ({ ...prev, wedCount: e.target.value }))}
                        className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-bold font-mono text-center text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-1 text-center font-bold">Thu</label>
                      <input 
                        type="number"
                        min="0"
                        placeholder="0"
                        value={draft.thuCount}
                        onChange={(e) => setDraft(prev => ({ ...prev, thuCount: e.target.value }))}
                        className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-bold font-mono text-center text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-1 text-center font-bold">Fri</label>
                      <input 
                        type="number"
                        min="0"
                        placeholder="0"
                        value={draft.friCount}
                        onChange={(e) => setDraft(prev => ({ ...prev, friCount: e.target.value }))}
                        className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-bold font-mono text-center text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Active Tech Headcount</label>
                    <input 
                      type="number"
                      placeholder="e.g. 7"
                      value={draft.techsAvailable}
                      onChange={(e) => setDraft(prev => ({ ...prev, techsAvailable: e.target.value }))}
                      className="w-full bg-[#111625] border border-white/5 rounded-xl px-3 py-2 text-white font-semibold font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Tech Shift Hours</label>
                    <input 
                      type="number"
                      step="0.5"
                      placeholder="Default: 8"
                      value={draft.hoursPerDay}
                      onChange={(e) => setDraft(prev => ({ ...prev, hoursPerDay: e.target.value }))}
                      className="w-full bg-[#111625] border border-white/5 rounded-xl px-3 py-2 text-white font-semibold font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Absenteeism Rate %</label>
                    <input 
                      type="number"
                      step="0.1"
                      placeholder="Default: 5"
                      value={draft.absenteeismRate}
                      onChange={(e) => setDraft(prev => ({ ...prev, absenteeismRate: e.target.value }))}
                      className="w-full bg-[#111625] border border-white/5 rounded-xl px-3 py-2 text-white font-semibold font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Target Shop Efficiency %</label>
                    <input 
                      type="number"
                      step="1"
                      placeholder="Default: 100"
                      value={draft.efficiencyForecast}
                      onChange={(e) => setDraft(prev => ({ ...prev, efficiencyForecast: e.target.value }))}
                      className="w-full bg-[#111625] border border-white/5 rounded-xl px-3 py-2 text-white font-semibold font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 💼 SECTION 2: REVENUE MIX STRATEGY TARGETS */}
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-white/5 pb-1">
                  <h4 className="text-[11px] font-black text-brand-secondary uppercase tracking-wider flex items-center gap-1">
                    💼 Revenue Mix Strategy Targets
                  </h4>
                  <span className={cn(
                    "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                    (Number(draft.cpMix) || 0) + (Number(draft.warrMix) || 0) + (Number(draft.internalMix) || 0) === 100
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/10"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/10"
                  )}>
                    Mix: {((Number(draft.cpMix) || 0) + (Number(draft.warrMix) || 0) + (Number(draft.internalMix) || 0))}% / 100%
                  </span>
                </div>

                <div className="space-y-2.5">
                  {/* Customer Pay Row */}
                  <div className="bg-slate-900/30 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[9px] font-black uppercase text-brand-primary block mb-1.5">• Customer Pay Segment</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-slate-450 block mb-0.5 font-bold">Mix Target %</label>
                        <input 
                          type="number"
                          placeholder="e.g. 49"
                          value={draft.cpMix}
                          onChange={(e) => setDraft(prev => ({ ...prev, cpMix: e.target.value }))}
                          className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-semibold font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-450 block mb-0.5 font-bold">Target ELR ($)</label>
                        <input 
                          type="number"
                          placeholder="e.g. 157"
                          value={draft.cpRate}
                          onChange={(e) => setDraft(prev => ({ ...prev, cpRate: e.target.value }))}
                          className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-semibold font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-450 block mb-0.5 font-bold">Target GP %</label>
                        <input 
                          type="number"
                          placeholder="e.g. 75"
                          value={draft.cpGp}
                          onChange={(e) => setDraft(prev => ({ ...prev, cpGp: e.target.value }))}
                          className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-semibold font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Warranty Row */}
                  <div className="bg-slate-900/30 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[9px] font-black uppercase text-brand-secondary block mb-1.5">• Warranty Pay Segment</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-slate-450 block mb-0.5 font-bold">Mix Target %</label>
                        <input 
                          type="number"
                          placeholder="e.g. 34"
                          value={draft.warrMix}
                          onChange={(e) => setDraft(prev => ({ ...prev, warrMix: e.target.value }))}
                          className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-semibold font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-450 block mb-0.5 font-bold">Target ELR ($)</label>
                        <input 
                          type="number"
                          placeholder="e.g. 142"
                          value={draft.warrRate}
                          onChange={(e) => setDraft(prev => ({ ...prev, warrRate: e.target.value }))}
                          className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-semibold font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-450 block mb-0.5 font-bold">Target GP %</label>
                        <input 
                          type="number"
                          placeholder="e.g. 70"
                          value={draft.warrGp}
                          onChange={(e) => setDraft(prev => ({ ...prev, warrGp: e.target.value }))}
                          className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-semibold font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Internal Row */}
                  <div className="bg-slate-900/30 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[9px] font-black uppercase text-slate-400 block mb-1.5">• Internal Pay Segment</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-slate-450 block mb-0.5 font-bold">Mix Target %</label>
                        <input 
                          type="number"
                          placeholder="e.g. 17"
                          value={draft.internalMix}
                          onChange={(e) => setDraft(prev => ({ ...prev, internalMix: e.target.value }))}
                          className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-semibold font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-450 block mb-0.5 font-bold">Target ELR ($)</label>
                        <input 
                          type="number"
                          placeholder="e.g. 115"
                          value={draft.internalRate}
                          onChange={(e) => setDraft(prev => ({ ...prev, internalRate: e.target.value }))}
                          className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-semibold font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-450 block mb-0.5 font-bold">Target GP %</label>
                        <input 
                          type="number"
                          placeholder="e.g. 60"
                          value={draft.internalGp}
                          onChange={(e) => setDraft(prev => ({ ...prev, internalGp: e.target.value }))}
                          className="w-full bg-[#111625] border border-white/5 rounded-lg p-1.5 text-white font-semibold font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 📊 SECTION 3: ANCILLARY FIXED OPS DEPT ESTIMATES */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1 border-b border-white/5 pb-1">
                  📊 Ancillary Fixed Ops Dept Estimates
                </h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Sublet Sales Total ($)</label>
                    <input 
                      type="number"
                      placeholder="e.g. 12500"
                      value={draft.subletSales}
                      onChange={(e) => setDraft(prev => ({ ...prev, subletSales: e.target.value }))}
                      className="w-full bg-[#111625] border border-white/5 rounded-xl px-3 py-2 text-white font-semibold font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Sublet Gross Profit ($)</label>
                    <input 
                      type="number"
                      placeholder="e.g. 3125"
                      value={draft.subletGrossProfit}
                      onChange={(e) => setDraft(prev => ({ ...prev, subletGrossProfit: e.target.value }))}
                      className="w-full bg-[#111625] border border-white/5 rounded-xl px-3 py-2 text-white font-semibold font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Misc Sales Total ($)</label>
                    <input 
                      type="number"
                      placeholder="e.g. 5680"
                      value={draft.miscSales}
                      onChange={(e) => setDraft(prev => ({ ...prev, miscSales: e.target.value }))}
                      className="w-full bg-[#111625] border border-white/5 rounded-xl px-3 py-2 text-white font-semibold font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Misc Gross Profit ($)</label>
                    <input 
                      type="number"
                      placeholder="e.g. 1420"
                      value={draft.miscGrossProfit}
                      onChange={(e) => setDraft(prev => ({ ...prev, miscGrossProfit: e.target.value }))}
                      className="w-full bg-[#111625] border border-white/5 rounded-xl px-3 py-2 text-white font-semibold font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Unapplied Time Drag ($) <span className="text-rose-500 font-bold text-[9px]">(Expense)</span></label>
                  <input 
                    type="number"
                    placeholder="e.g. 2500"
                    value={draft.unappliedTime}
                    onChange={(e) => setDraft(prev => ({ ...prev, unappliedTime: e.target.value }))}
                    className="w-full bg-[#111625] border border-white/5 rounded-xl px-3 py-2 text-white font-semibold font-mono text-xs"
                  />
                </div>
              </div>

            </div>

            <div className="pt-3 flex justify-end gap-3 border-t border-white/5">
              <button 
                onClick={() => {
                  // 1. Validation: Total Mix targets combined must equal 100%
                  const cpMixVal = Number(draft.cpMix) || 0;
                  const warrMixVal = Number(draft.warrMix) || 0;
                  const intMixVal = Number(draft.internalMix) || 0;
                  const totalMix = cpMixVal + warrMixVal + intMixVal;

                  if (Math.abs(totalMix - 100) > 0.001) {
                    setValidationError(`Total Mix targets combined must equal exactly 100%! (Current sum: ${totalMix}%)`);
                    return;
                  }

                  // Weekdays in Month calculation
                  const mon = Number(draft.monCount) || 0;
                  const tue = Number(draft.tueCount) || 0;
                  const wed = Number(draft.wedCount) || 0;
                  const thu = Number(draft.thuCount) || 0;
                  const fri = Number(draft.friCount) || 0;
                  const computedDays = mon + tue + wed + thu + fri;

                  if (computedDays <= 0) {
                    setValidationError("At least one weekday count must be greater than 0.");
                    return;
                  }

                  const headcount = Number(draft.techsAvailable) || 0;
                  if (headcount <= 0) {
                    setValidationError("Active Tech Headcount must be greater than 0.");
                    return;
                  }

                  setValidationError(null);

                  // Set finalized inputs
                  setInputs({
                    daysInMonth: computedDays,
                    techsAvailable: headcount,
                    hoursPerDay: Number(draft.hoursPerDay) || 8,
                    absenteeismRate: (Number(draft.absenteeismRate) || 5) / 100,
                    efficiencyForecast: (Number(draft.efficiencyForecast) || 100) / 100,
                    cpMix: cpMixVal / 100,
                    cpRate: Number(draft.cpRate) || 0,
                    cpGp: (Number(draft.cpGp) || 0) / 100,
                    warrMix: warrMixVal / 100,
                    warrRate: Number(draft.warrRate) || 0,
                    warrGp: (Number(draft.warrGp) || 0) / 100,
                    internalMix: intMixVal / 100,
                    internalRate: Number(draft.internalRate) || 0,
                    internalGp: (Number(draft.internalGp) || 0) / 100,
                    subletSales: Number(draft.subletSales) || 0,
                    subletGrossProfit: Number(draft.subletGrossProfit) || 0,
                    miscSales: Number(draft.miscSales) || 0,
                    miscGrossProfit: Number(draft.miscGrossProfit) || 0,
                    unappliedTime: Number(draft.unappliedTime) || 0,
                  });

                  setHasRunForecast(true);
                  setShowFormModal(false);
                  onSuccess?.("Forecast calculation applied and model activated.");
                }}
                className="w-full py-2.5 rounded-xl bg-brand-primary text-slate-950 font-black uppercase tracking-wider text-xs cursor-pointer hover:bg-brand-primary/95 text-center block"
              >
                Apply & Run Forecast Model
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL PRINT SCREEN & PREVIEW MODAL */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4 md:p-8 overflow-y-auto no-print">
          <div className="bg-[#0b0f19] border border-white/10 rounded-3xl max-w-4xl w-full flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
            
            {/* Header controls inside print modal */}
            <div className="p-5 border-b border-white/5 bg-slate-950/40 flex items-center justify-between shrink-0 no-print">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={15} className="text-brand-primary" /> Forecast Document Matrix
                </h3>
                <p className="text-xxs text-slate-400">Review print layout. Standard physical US-Letter paper portrait margins applied.</p>
              </div>
              <div className="flex gap-2.5">
                <button 
                  onClick={handlePrint}
                  className="px-4 py-2 rounded-xl text-xxs font-black bg-indigo-505 bg-indigo-500 text-white uppercase tracking-widest hover:bg-indigo-400 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Printer size={12} />
                  Print Physical Sheet
                </button>
                <button 
                  onClick={() => setShowPrintModal(false)}
                  className="px-4 py-2 rounded-xl text-xxs font-bold border border-white/10 bg-slate-900 text-slate-350 hover:bg-slate-800 uppercase tracking-widest cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>

            {/* Print document layout body */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-white text-slate-900 select-text" id="print-forecast-modal">
              
              {/* Outer border for print matrix style */}
              <div className="space-y-8 max-w-3xl mx-auto border-4 border-slate-900 p-8">
                
                {/* Header segment of paper sheet */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                  <div>
                    <h1 className="text-2xl font-black uppercase tracking-tight text-slate-950">HYUNDAI FIELD SERVICES</h1>
                    <p className="text-xs uppercase font-extrabold text-slate-600 tracking-widest mt-0.5">Fixed Operations Financial Projections</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                      Dealership Code: {currentDealershipId.toUpperCase()} • DEPT ID: ADMIN_EOM_FORECAST
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 font-black text-xs uppercase border-2 border-slate-900 text-slate-900 bg-slate-100">
                      FORECAST SHEET
                    </span>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1.5">
                      DATE: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Sub heading commentary block */}
                <div className="p-4 bg-slate-100 border border-slate-300 text-xs text-slate-700 leading-relaxed font-serif">
                  <strong>PROJECTION METRIC SUMMATION:</strong> This document compiles shop capacity indicators for the next calendar month. Estimates are derived using current live tracking variables MTD, and adjusted using targeted technical efficiency values specified by the Fixed Operations Director.
                </div>

                {/* CAPACITY PARAMETERS SHEET TABLE */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1">
                    1. Shop Mechanical Capacity Metrics
                  </h3>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-400 bg-slate-100 text-slate-800 font-bold uppercase text-[10px]">
                        <th className="py-2 px-3">Operational Parameter</th>
                        <th className="py-2 px-3 text-right">Value Indicator</th>
                        <th className="py-2 px-3 text-right">Shop Impact Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="py-2.5 px-3 font-semibold">Active Billing Days</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">{inputs.daysInMonth} Days</td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-slate-600">Total service lane operational days.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold">Staffed Technicians</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">{inputs.techsAvailable} Techs</td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-slate-600">Mechanical and express bay personnel.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold">Standard Shift Hours</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">{inputs.hoursPerDay} Hrs/Day</td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-slate-600">Standard daily service clock hours.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold">Maximum Gross Capacity</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-950">{results.rawHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })} Hrs</td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-slate-600">Theoretical limits at 100% attendance.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold">Absenteeism Factor</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">{(inputs.absenteeismRate * 100).toFixed(0)}%</td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-slate-600">Projected lost hours: -{results.lostHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} hrs.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-semibold">Shop Efficiency Mod</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">{(inputs.efficiencyForecast * 100).toFixed(0)}%</td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-slate-600">Actual flat-rate technical yields.</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-900">
                        <td className="py-2 px-3 uppercase text-[10px]">Net Clockable Hours Available</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-950">{results.netProjectedHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} Hrs</td>
                        <td className="py-2 px-3 text-right text-[10px] uppercase text-emerald-800">Target Production Capacity</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* FINANCIAL Projections TABLE */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 border-b-2 border-slate-900 pb-1">
                    2. Portfolio Allocations & Yield Estimates
                  </h3>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-400 bg-slate-100 text-slate-800 font-bold uppercase text-[9px]">
                        <th className="py-2 px-2">Service Segment</th>
                        <th className="py-2 px-2 text-right">Portfolio Mix</th>
                        <th className="py-2 px-2 text-right">Segment Hours</th>
                        <th className="py-2 px-2 text-right">Hourly Rate</th>
                        <th className="py-2 px-2 text-right">Projected Sales</th>
                        <th className="py-2 px-2 text-right">Target GP %</th>
                        <th className="py-2 px-2 text-right">Gross Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="py-2 px-2 font-bold text-slate-950">Customer Pay (CP)</td>
                        <td className="py-2 px-2 text-right font-mono">{Math.round(inputs.cpMix * 100)}%</td>
                        <td className="py-2 px-2 text-right font-mono">{results.cpHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} hrs</td>
                        <td className="py-2 px-2 text-right font-mono">${inputs.cpRate}</td>
                        <td className="py-2 px-2 text-right font-mono">${results.cpSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right font-mono">{Math.round(inputs.cpGp * 100)}%</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">${results.cpGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 font-bold text-slate-950">Warranty (Warr)</td>
                        <td className="py-2 px-2 text-right font-mono">{Math.round(inputs.warrMix * 100)}%</td>
                        <td className="py-2 px-2 text-right font-mono">{results.warrHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} hrs</td>
                        <td className="py-2 px-2 text-right font-mono">${inputs.warrRate}</td>
                        <td className="py-2 px-2 text-right font-mono">${results.warrSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right font-mono">{Math.round(inputs.warrGp * 100)}%</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">${results.warrGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 font-bold text-slate-950">Internal / Reconditioning</td>
                        <td className="py-2 px-2 text-right font-mono">{Math.round(inputs.internalMix * 100)}%</td>
                        <td className="py-2 px-2 text-right font-mono">{results.internalHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} hrs</td>
                        <td className="py-2 px-2 text-right font-mono">${inputs.internalRate}</td>
                        <td className="py-2 px-2 text-right font-mono">${results.internalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right font-mono">{Math.round(inputs.internalGp * 100)}%</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">${results.internalGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                      
                      <tr className="bg-slate-50 font-extrabold border-t border-slate-400 text-slate-950">
                        <td className="py-2 px-2 uppercase text-[9px]">Labor Subtotal Summary</td>
                        <td className="py-2 px-2 text-right font-mono">100%</td>
                        <td className="py-2 px-2 text-right font-mono">{results.netProjectedHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} hrs</td>
                        <td className="py-2 px-2 text-right font-mono bg-slate-100/50">${results.blendedELR.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-mono bg-slate-100/50">${results.totalLaborSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right font-mono bg-slate-100/50">{Math.round(results.blendedGPPercent * 100)}%</td>
                        <td className="py-2 px-2 text-right font-mono font-bold bg-slate-100/50">${results.totalLaborGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>

                      <tr>
                        <td className="py-2 px-2 font-semibold text-slate-700">Sublet Lane Operations</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-400">-</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-400">-</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-400">-</td>
                        <td className="py-2 px-2 text-right font-mono">${inputs.subletSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right font-mono">{inputs.subletSales > 0 ? Math.round((inputs.subletGrossProfit / inputs.subletSales) * 100) : 0}%</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">${inputs.subletGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>

                      <tr>
                        <td className="py-2 px-2 font-semibold text-slate-700">Miscellaneous Revenue</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-400">-</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-400">-</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-400">-</td>
                        <td className="py-2 px-2 text-right font-mono">${inputs.miscSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right font-mono">{inputs.miscSales > 0 ? Math.round((inputs.miscGrossProfit / inputs.miscSales) * 100) : 0}%</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-950">${inputs.miscGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>

                      <tr className="bg-slate-100 font-black border-t-2 border-b border-slate-900 text-slate-950">
                        <td className="py-2.5 px-2 uppercase text-[9px]" colSpan={2}>Aggregate Service Department</td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-500">-</td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-500">-</td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-950">${results.totalServiceSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-500">{results.totalServiceSales > 0 ? Math.round((results.totalServiceGrossProfit / results.totalServiceSales) * 100) : 0}%</td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-950 font-bold">${results.totalServiceGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>

                      <tr>
                        <td className="py-2 px-2 font-semibold text-slate-650 italic text-[10px]" colSpan={6}>Less Unapplied Hours/Expense Deduction (Ledger Adjustment)</td>
                        <td className="py-2 px-2 text-right font-mono text-rose-700 font-bold">
                          -${inputs.unappliedTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      <tr className="bg-slate-900 font-black border-t-2 border-slate-900 text-white text-xs">
                        <td className="py-3 px-2 uppercase text-[9px]" colSpan={5}>Adjusted Total Service Gross Profit</td>
                        <td className="py-3 px-2 text-right font-mono" colSpan={2}>
                          ${results.adjustedTotalGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Baseline Compare Section */}
                <div className="p-4 border border-slate-350 space-y-2.5">
                  <h4 className="text-[10px] font-black uppercase text-slate-800 tracking-wider">
                    3. Baseline Verification Against Month-To-Date Log Performance
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-center text-xs">
                    <div className="p-2 border border-slate-200">
                      <span className="text-[10px] text-slate-550 block font-medium uppercase">MTD Sales Baseline</span>
                      <strong className="text-slate-900 text-sm font-black">${Math.round(liveDbMetrics.laborSales).toLocaleString()}</strong>
                    </div>
                    <div className="p-2 border border-slate-200">
                      <span className="text-[10px] text-slate-550 block font-medium uppercase">MTD Hours Baseline</span>
                      <strong className="text-slate-900 text-sm font-black">{Math.round(liveDbMetrics.hoursSold)} hrs</strong>
                    </div>
                    <div className="p-2 border border-slate-200">
                      <span className="text-[10px] text-slate-550 block font-medium uppercase">MTD ELR Baseline</span>
                      <strong className="text-indigo-900 text-sm font-black">${liveDbMetrics.elr.toFixed(2)}</strong>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500 text-center uppercase font-bold pt-1">
                    Deviation projection index: {results.totalLaborSales > 0 && liveDbMetrics.laborSales > 0 ? (((results.totalLaborSales / liveDbMetrics.laborSales) - 1) * 100).toFixed(1) + '%' : 'N/A'} volume flux.
                  </p>
                </div>

                {/* SIGNATURE SIGN-OFF BOTTOM REGION FOR PRINT DOCUMENT */}
                <div className="pt-12 grid grid-cols-2 gap-8 text-xs border-t border-slate-300 mt-12 text-slate-700">
                  <div className="space-y-4">
                    <p className="font-serif italic text-slate-400">Prepared and assembled with Hyundai Field Services intelligence models.</p>
                    <div className="pt-4 border-t border-slate-450 w-full font-bold uppercase tracking-widest text-[9px]">
                      Fixed Operations Director Signature
                    </div>
                  </div>
                  <div className="space-y-4 text-right">
                    <p className="font-sans font-bold uppercase text-[10px]">REPORTS VERIFICATION STAMP</p>
                    <div className="pt-4 border-t border-slate-450 w-full font-bold uppercase tracking-widest text-[9px]">
                      General Manager Signature
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

function InfoIcon({ size = 14, className = "" }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
