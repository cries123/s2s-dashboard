import React, { useState } from 'react';
import { 
  Search, 
  Loader2, 
  BadgeCheck, 
  Car, 
  Info, 
  AlertTriangle, 
  ListFilter, 
  Fuel, 
  Zap, 
  Droplets, 
  Gauge, 
  DollarSign, 
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../hooks/useAuth';

interface VinData {
  Variable: string;
  Value: string;
}

export const VinLookup: React.FC = () => {
  const { user } = useAuth();
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VinData[] | null>(null);
  const [recalls, setRecalls] = useState<any[] | null>(null);
  const [modelRecalls, setModelRecalls] = useState<any[] | null>(null);
  const [recallsExpanded, setRecallsExpanded] = useState(false);
  const [modelRecallsExpanded, setModelRecallsExpanded] = useState(false);
  const [fuelData, setFuelData] = useState<any | null>(null);
  const [marketValue, setMarketValue] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValuing, setIsValuing] = useState(false);
  const [valuationError, setValuationError] = useState<string | null>(null);

  const getMake = () => data?.find(r => (r.Variable === "Make" || r.Variable === "Vehicle Make"))?.Value;
  const getModel = () => data?.find(r => (r.Variable === "Model" || r.Variable === "Vehicle Model"))?.Value;
  const getYear = () => data?.find(r => (r.Variable === "Model Year" || r.Variable === "Vehicle Year"))?.Value;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVin = vin.trim().toUpperCase();
    if (!cleanVin || cleanVin.length < 17) return;

    setLoading(true);
    setError(null);
    setData(null);
    setRecalls(null);
    setModelRecalls(null);
    setRecallsExpanded(false);
    setModelRecallsExpanded(false);
    setFuelData(null);
    setMarketValue(null);
    setValuationError(null);
    try {
      // 1. Decode VIN
      const decodeRes = await fetch(`/api/nhtsa/decode/${cleanVin}`);
      if (!decodeRes.ok) {
        const text = await decodeRes.text();
        console.error("VIN Decode Error:", text);
        setError("Failed to decode VIN. The service might be temporarily unavailable.");
        setLoading(false);
        return;
      }
      const decodeResult = await decodeRes.json();
      
      if (decodeResult.Results) {
        const filtered = decodeResult.Results.filter((r: any) => 
          r.Value && 
          r.Value !== "Not Applicable" && 
          !["Error Code", "Error Text"].includes(r.Variable)
        );
        setData(filtered);
        
        const errorCode = decodeResult.Results.find((r: any) => r.Variable === "Error Code")?.Value;
        if (errorCode !== "0") {
          setError(decodeResult.Results.find((r: any) => r.Variable === "Error Text")?.Value || "Invalid VIN");
          setLoading(false);
          return;
        }

        const make = decodeResult.Results.find((r: any) => r.Variable === "Make")?.Value;
        const model = decodeResult.Results.find((r: any) => r.Variable === "Model")?.Value;
        const year = decodeResult.Results.find((r: any) => r.Variable === "Model Year")?.Value;

        // 2. Fetch Recalls
        try {
          const recallRes = await fetch(`/api/nhtsa/recallsByVin/${cleanVin}`);
          if (recallRes.ok) {
            const recallData = await recallRes.json();
            const openRecalls = recallData.results || recallData.Results || [];
            setRecalls(openRecalls);
          }

          if (make && model && year) {
            const modelRecallRes = await fetch(`/api/nhtsa/recalls?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}`);
            if (modelRecallRes.ok) {
              const modelRecallData = await modelRecallRes.json();
              const mRecalls = modelRecallData.results || modelRecallData.Results || [];
              setModelRecalls(mRecalls);
            }
          }
        } catch (rErr) {
          console.error("Recall fetch failed", rErr);
        }

        // 3. Fetch Fuel Economy Data
        if (make && model && year) {
          try {
            const optionsRes = await fetch(`https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${make}&model=${model}`, {
              headers: { 'Accept': 'application/json' }
            });
            const options = await optionsRes.json();
            if (options && options.menuItem) {
              const vehicleId = Array.isArray(options.menuItem) ? options.menuItem[0].value : options.menuItem.value;
              if (vehicleId) {
                const detailRes = await fetch(`https://www.fueleconomy.gov/ws/rest/vehicle/${vehicleId}`, {
                  headers: { 'Accept': 'application/json' }
                });
                const details = await detailRes.json();
                setFuelData(details);
              }
            }
          } catch (fErr) {
            console.error("Fuel Economy fetch failed", fErr);
          }

          // 4. Fetch Valuation
          try {
            setIsValuing(true);
            const valRes = await fetch('/api/estimate-value', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                year,
                make,
                model,
                trim: filtered.find((r: any) => r.Variable === "Series")?.Value || "",
                mileage: "15000"
              })
            });
            
            if (!valRes.ok) {
              let msg = 'Valuation service unavailable';
              const contentType = valRes.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const errData = await valRes.json();
                msg = errData.error || msg;
              } else {
                const text = await valRes.text();
                console.error('Valuation service non-JSON error:', text.substring(0, 200));
              }
              setValuationError(msg);
            } else {
              let valData: any;
              try {
                valData = await valRes.json();
                setMarketValue(valData);
              } catch (jsonErr) {
                console.error('Failed to parse valuation JSON:', jsonErr);
                setValuationError("Failed to parse system response");
              }
            }
          } catch (vErr) {
            setValuationError("Unable to connect to valuation service");
          } finally {
            setIsValuing(false);
          }
        }
      }
    } catch (err) {
      setError("Failed to fetch data from NHTSA database.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Search Header */}
      <div className="relative">
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-brand-primary/10 blur-[100px] rounded-full pointer-events-none" />
        
        <header className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-brand-primary/10 rounded-xl border border-brand-primary/20 backdrop-blur-sm">
              <Search className="text-brand-primary" size={22} />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">VIN Intelligence</h2>
          </div>
          <p className="text-slate-500 text-sm font-medium tracking-wide">Advanced Forensic Vehicle Analysis & Recall Monitoring</p>
        </header>

        <div className="mt-8 group relative">
          <div className="absolute inset-0 bg-brand-primary/5 blur-2xl rounded-3xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <form onSubmit={handleSearch} className="relative flex flex-col md:flex-row gap-0 bg-slate-900/40 backdrop-blur-2xl border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl p-1.5 focus-within:border-brand-primary/30 transition-all">
            <div className="relative flex-1">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-brand-primary transition-colors" size={20} />
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="ENTER 17-CHARACTER VIN..."
                className="w-full bg-transparent border-none focus:ring-0 focus:outline-none py-6 pl-16 pr-6 text-xl font-black text-white placeholder:text-slate-600 tracking-[0.25em] uppercase font-mono"
                maxLength={17}
              />
            </div>
            <button 
              type="submit"
              disabled={loading || vin.length < 17}
              className="bg-brand-primary hover:bg-brand-secondary disabled:bg-slate-800 text-white px-10 py-5 rounded-[1.75rem] font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl shadow-brand-primary/20 m-1"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <BadgeCheck size={18} />}
              Analyze Vehicle
            </button>
          </form>
        </div>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-xs font-black uppercase tracking-widest"
        >
          <AlertTriangle size={16} />
          {error}
        </motion.div>
      )}

      {data && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 stagger-fade-in">
          
          {/* Main Display: Identity & Image */}
          <div className="lg:col-span-4 space-y-6">
            <div className="relative overflow-hidden group rounded-[2.5rem] bg-slate-950/40 border border-white/5 backdrop-blur-3xl shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 via-transparent to-brand-secondary/10 opacity-30" />
              
              <div className="relative p-10 flex flex-col md:flex-row items-center gap-10">
                <div className="flex-1 space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-primary/10 border border-brand-primary/20 rounded-full">
                    <div className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-pulse" />
                    <span className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em]">Verified Identification</span>
                  </div>
                  
                  <h3 className="text-5xl font-black text-white leading-[1.1] tracking-tighter uppercase italic">
                    <span className="text-brand-primary block text-2xl not-italic tracking-widest mb-1">{getYear()}</span>
                    {getMake()} {getModel()}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-4 text-slate-400 font-mono text-sm tracking-widest font-bold">
                    <div className="flex items-center gap-2 bg-white/5 py-1.5 px-4 rounded-xl border border-white/5">
                      <span className="text-slate-500">VIN</span>
                      <span className="text-white">{vin}</span>
                    </div>
                    {data.find(r => r.Variable === "Series")?.Value && (
                      <span className="text-xs uppercase bg-white/5 py-1.5 px-4 rounded-xl border border-white/5">
                        Trim: {data.find(r => r.Variable === "Series")?.Value}
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative flex-1 flex justify-center items-center py-6">
                  <div className="absolute inset-0 bg-brand-primary/20 blur-[100px] rounded-full opacity-20 group-hover:opacity-40 transition-opacity" />
                  <Car className="text-white/5 group-hover:text-brand-primary/20 transition-colors w-48 h-48 lg:w-64 lg:h-64 absolute -bottom-10 -right-10 pointer-events-none rotate-12" />
                  <div className="relative z-10 w-full flex justify-center">
                    <div className="p-12 bg-white/5 backdrop-blur-sm rounded-[3rem] border border-white/10 shadow-2xl">
                      <Car className="text-brand-primary" size={64} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recall Status Bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {recalls && recalls.length > 0 ? (
                  <button 
                    onClick={() => setRecallsExpanded(!recallsExpanded)}
                    className="flex flex-col gap-4 p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl hover:bg-rose-500/15 transition-all text-left group shadow-lg shadow-rose-500/10"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-rose-500/20 rounded-2xl flex items-center justify-center text-rose-500 ring-4 ring-rose-500/5 group-hover:scale-110 transition-transform">
                          <ShieldAlert size={24} />
                        </div>
                        <div>
                          <h4 className="text-lg font-black text-rose-500 leading-none">{recalls.length} RECALLS</h4>
                          <p className="text-[10px] font-bold text-rose-400/60 uppercase tracking-widest mt-1">Pending Unrepaired Repairs</p>
                        </div>
                      </div>
                      <div className="p-2 bg-rose-500/10 rounded-xl text-rose-500 group-hover:translate-x-1 transition-transform">
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  </button>
               ) : (
                 <div className="flex items-center gap-4 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl shadow-lg shadow-emerald-500/10">
                   <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500">
                     <ShieldCheck size={24} />
                   </div>
                   <div>
                     <h4 className="text-lg font-black text-emerald-500 leading-none">NO RECALLS</h4>
                     <p className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest mt-1">Status: Fully Compliant</p>
                   </div>
                 </div>
               )}

               <div className="flex items-center gap-4 p-6 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl">
                  <div className="w-12 h-12 bg-brand-primary/20 rounded-2xl flex items-center justify-center text-brand-primary">
                    <BadgeCheck size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-white leading-none">VALID VIN</h4>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Format: North American Std</p>
                  </div>
               </div>
            </div>
          </div>

          {/* Right Column: Key Metrics */}
          <div className="lg:col-span-2 space-y-6">
            {/* Market Sidepiece */}
            <div className="p-8 bg-slate-950/40 backdrop-blur-2xl border border-white/5 rounded-[2rem] shadow-2xl flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-brand-primary/10 rounded-lg">
                    <DollarSign className="text-brand-primary" size={16} />
                  </div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Market Value</h4>
                </div>
                {marketValue?.marketTrend && (
                  <div className={cn(
                    "px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border",
                    marketValue.marketTrend === 'Rising' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-slate-500/10 border-white/10 text-slate-500"
                  )}>
                    {marketValue.marketTrend}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-8">
                {isValuing ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-10 bg-white/5 rounded-2xl w-full" />
                    <div className="h-32 bg-white/5 rounded-3xl w-full" />
                  </div>
                ) : marketValue ? (
                  <>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Est. Trade-In Range</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-white tracking-tighter">${(marketValue.tradeInLow / 1000).toFixed(1)}k</span>
                        <span className="text-slate-600 font-bold mx-1">/</span>
                        <span className="text-2xl font-black text-brand-primary tracking-tighter">${(marketValue.tradeInHigh / 1000).toFixed(1)}k</span>
                      </div>
                    </div>

                    <div className="bg-brand-primary/5 border border-brand-primary/10 p-5 rounded-[2rem] relative overflow-hidden group">
                      <Sparkles className="absolute -right-2 -top-2 text-brand-primary/10 w-20 h-20 grayscale" />
                      <div className="flex items-center gap-2 mb-3">
                        <Maximize2 size={12} className="text-brand-primary" />
                        <span className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em]">Profit Max Insight</span>
                      </div>
                      <p className="text-xs text-slate-300 font-medium leading-relaxed italic">"{marketValue.advisorTip}"</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-slate-500 uppercase tracking-widest">Private Party</span>
                        <span className="text-white">${(marketValue.privatePartyLow / 1000).toFixed(1)}k - ${(marketValue.privatePartyHigh / 1000).toFixed(1)}k</span>
                      </div>
                      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="w-2/3 h-full bg-brand-primary/40" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-700 opacity-30 text-center">
                    <DollarSign size={48} strokeWidth={1} />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] mt-4">Analyzing Market...</p>
                  </div>
                )}
              </div>
              
              <div className="mt-8 flex items-center gap-2 text-slate-700">
                <Info size={12} />
                <span className="text-[8px] font-black uppercase tracking-widest">Regional Market Mapping Enabled</span>
              </div>
            </div>
          </div>

          {/* Efficiency & Recalls Details (Full Width Flow) */}
          <div className="lg:col-span-6 space-y-6">
            <AnimatePresence>
               {recallsExpanded && recalls && (
                 <motion.div 
                   initial={{ height: 0, opacity: 0 }}
                   animate={{ height: 'auto', opacity: 1 }}
                   exit={{ height: 0, opacity: 0 }}
                   className="overflow-hidden"
                 >
                   <div className="p-8 bg-rose-950/20 border border-rose-500/20 rounded-[2.5rem] mb-6 backdrop-blur-xl">
                     <div className="flex items-center justify-between mb-8">
                        <div>
                          <h4 className="text-2xl font-black text-rose-500 tracking-tighter uppercase italic">Safety Campaign Directives</h4>
                          <p className="text-rose-400/60 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Sourced from NHTSA Forensic Database</p>
                        </div>
                        <button onClick={() => setRecallsExpanded(false)} className="p-2 hover:bg-rose-500/10 rounded-full transition-colors">
                          <AlertTriangle className="text-rose-500" size={24} />
                        </button>
                     </div>
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {recalls.map((recall, i) => (
                           <div key={i} className="p-8 bg-black/40 border border-white/5 rounded-3xl shadow-2xl">
                             <div className="flex justify-between items-start mb-6">
                               <div className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full">
                                 <span className="text-[9px] font-black text-rose-500 tracking-widest uppercase">ID: {recall.NHTSACampaignNumber}</span>
                               </div>
                               <span className="text-[10px] font-bold text-slate-500 uppercase">{recall.ReportReceivedDate}</span>
                             </div>
                             <h5 className="text-xl font-bold text-white mb-3 leading-tight underline decoration-rose-500/30 underline-offset-4">{recall.Component}</h5>
                             <p className="text-sm text-slate-400 font-medium leading-relaxed mb-8">{recall.Summary}</p>
                             <div className="p-6 bg-rose-500/5 border border-rose-500/10 rounded-[1.5rem]">
                                <div className="flex items-center gap-2 mb-3">
                                  <ShieldAlert size={14} className="text-rose-400" />
                                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Mandatory Field Remedy</p>
                                </div>
                                <p className="text-sm text-slate-300 font-medium leading-relaxed italic">"{recall.Remedy}"</p>
                             </div>
                           </div>
                        ))}
                     </div>
                   </div>
                 </motion.div>
               )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Efficiency Panel */}
              <div className="p-8 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2.5rem] shadow-2xl">
                <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-amber-500/10 rounded-xl">
                        <Fuel className="text-amber-500" size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">Propulsion Metrics</h4>
                        <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Source: fueleconomy.gov</p>
                      </div>
                   </div>
                </div>

                {fuelData ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/5 group hover:border-amber-500/20 transition-colors">
                      <p className="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest">City Cycle</p>
                      <p className="text-4xl font-black text-white tracking-tighter">{fuelData.city08}<span className="text-sm ml-1 text-slate-600 font-bold">MPG</span></p>
                    </div>
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/5 group hover:border-amber-500/20 transition-colors">
                      <p className="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest">Highway</p>
                      <p className="text-4xl font-black text-white tracking-tighter">{fuelData.highway08}<span className="text-sm ml-1 text-slate-600 font-bold">MPG</span></p>
                    </div>
                    <div className="p-6 bg-amber-500/10 rounded-3xl border border-amber-500/20 ring-4 ring-amber-500/5 flex flex-col justify-center">
                       <div className="flex items-center justify-between mb-1">
                         <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Combined</p>
                         <Gauge size={14} className="text-amber-500 opacity-40" />
                       </div>
                       <p className="text-4xl font-black text-white tracking-tighter">{fuelData.comb08}<span className="text-xs ml-1 text-amber-500 font-black">AVG</span></p>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center opacity-20">
                     <Loader2 className="animate-spin mb-4" size={32} />
                     <p className="text-[10px] font-black tracking-widest uppercase">Fetching Diagnostics...</p>
                  </div>
                )}
              </div>

              {/* Historical Context Bar */}
              {modelRecalls && modelRecalls.length > 0 && (
                <div className="p-8 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2.5rem] shadow-2xl">
                   <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-slate-800/40 rounded-xl text-slate-400">
                          <ListFilter size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-white uppercase tracking-widest">Model Heritage</h4>
                          <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Historical Platform Recalls</p>
                        </div>
                     </div>
                     <div className="px-4 py-2 bg-slate-950/50 rounded-2xl border border-white/5">
                        <span className="text-xl font-black text-white font-mono">{modelRecalls.length}</span>
                     </div>
                  </div>

                  <div className="space-y-3 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                     {modelRecalls.slice(0, 5).map((r, i) => (
                        <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                           <div className="flex-1 overflow-hidden">
                              <p className="text-[10px] font-black text-slate-300 truncate tracking-tight">{r.Component}</p>
                              <p className="text-[8px] font-bold text-slate-600 uppercase">Affected System Path</p>
                           </div>
                           <ArrowRight size={12} className="text-slate-700 ml-4 shrink-0" />
                        </div>
                     ))}
                  </div>

                  <button 
                    onClick={() => setModelRecallsExpanded(!modelRecallsExpanded)}
                    className="w-full mt-6 py-4 bg-slate-950/50 border border-white/5 rounded-2xl text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] hover:bg-slate-950 transition-colors"
                  >
                    {modelRecallsExpanded ? 'Compact List' : 'View Full Model History'}
                  </button>
                </div>
              )}
            </div>
          </div>

            {/* Forensic Specs Grid */}
          <div className="lg:col-span-6 space-y-6 pt-12">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-px flex-1 bg-white/5" />
              <h4 className="text-[11px] font-black text-slate-600 uppercase tracking-[0.4em] px-4 italic">Full Forensic Specification Grid</h4>
              <div className="h-px flex-1 bg-white/5" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {data.map((item, idx) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.01 }}
                  key={idx} 
                  className="p-5 bg-slate-950/20 backdrop-blur-xl border border-white/5 rounded-2xl group hover:border-brand-primary/20 hover:bg-brand-primary/5 transition-all"
                >
                  <p className="text-[8px] font-black text-slate-600 group-hover:text-brand-primary/60 uppercase tracking-widest mb-2 truncate transition-colors">{item.Variable}</p>
                  <p className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors truncate">{item.Value}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {!data && !loading && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative min-h-[500px] flex flex-col items-center justify-center p-20 rounded-[3rem] border border-dashed border-white/5 bg-slate-900/10 overflow-hidden group"
        >
          <div className="absolute inset-0 bg-brand-primary/5 opacity-0 group-hover:opacity-100 transition-opacity blur-3xl rounded-full scale-50" />
          
          <div className="relative p-12 bg-slate-950 rounded-[2.5rem] border border-white/5 shadow-2sl mb-8 transform group-hover:-translate-y-2 transition-transform duration-500">
             <Car size={80} strokeWidth={1} className="text-slate-800" />
          </div>
          
          <div className="text-center space-y-3 relative z-10">
            <h3 className="text-2xl font-black text-white tracking-widest uppercase italic">Diagnostic Terminal Alpha</h3>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em]">Initialize vehicle scan by entering a unique 17-character VIN above</p>
          </div>
          
          <div className="mt-12 flex items-center gap-8 opacity-20">
             <div className="flex items-center gap-2">
               <ShieldCheck size={16} />
               <span className="text-[9px] font-black uppercase tracking-widest">NHTSA Secure</span>
             </div>
             <div className="flex items-center gap-2">
               <Zap size={16} />
               <span className="text-[9px] font-black uppercase tracking-widest">Live API Stream</span>
             </div>
             <div className="flex items-center gap-2">
               <Sparkles size={16} />
               <span className="text-[9px] font-black uppercase tracking-widest">Regional Market Pulse</span>
             </div>
          </div>
        </motion.div>
      )}

      {/* Model Recalls Expansion Panel (Global Overlay Style) */}
      <AnimatePresence>
        {modelRecallsExpanded && modelRecalls && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => setModelRecallsExpanded(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-6xl max-h-[80vh] bg-slate-900 border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-10 border-b border-white/5 flex items-center justify-between">
                <div>
                   <h3 className="text-3xl font-black text-white tracking-tighter uppercase italic">Platform Recall History</h3>
                   <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mt-1">{getYear()} {getMake()} {getModel()} (Generic Model Context)</p>
                </div>
                <button onClick={() => setModelRecallsExpanded(false)} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors">
                  <ArrowRight className="rotate-180" size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 custom-scrollbar">
                {modelRecalls.map((recall, i) => (
                  <div key={i} className="p-8 bg-slate-950/50 border border-white/5 rounded-3xl hover:border-brand-primary/20 transition-all group">
                     <div className="flex justify-between items-start mb-6">
                        <span className="text-[9px] font-black text-brand-primary uppercase tracking-[0.3em]">#{recall.NHTSACampaignNumber}</span>
                        <span className="text-[9px] font-bold text-slate-600 uppercase italic">{recall.ReportReceivedDate}</span>
                     </div>
                     <h5 className="text-base font-bold text-white mb-3 group-hover:text-brand-primary transition-colors leading-tight">{recall.Component}</h5>
                     <p className="text-xs text-slate-500 leading-relaxed font-medium line-clamp-4 italic">"{recall.Summary}"</p>
                  </div>
                ))}
              </div>
              
              <div className="p-6 bg-slate-950 border-t border-white/5 text-center">
                 <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest italic">Disclaimer: Model-wide recalls may not apply to your specific VIN if repairs were previously completed.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

