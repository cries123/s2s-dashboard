import React, { useState } from 'react';
import { 
  Search, 
  Loader2, 
  BadgeCheck, 
  Car, 
  Info, 
  AlertTriangle,
  Fuel,
  Zap, 
  Droplets, 
  Gauge, 
  DollarSign, 
  Sparkles,
  Maximize2
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../hooks/useAuth';
import { PageHeader } from '../../layout/PageHeader';
import { VinRecallReport } from './VinRecallReport';
import { fetchVinRecalls, type VinRecallReport as RecallReport } from '../../../lib/recallApi';

interface VinData {
  Variable: string;
  Value: string;
}

export const VinLookup: React.FC = () => {
  const { user } = useAuth();
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VinData[] | null>(null);
  const [recallReport, setRecallReport] = useState<RecallReport | null>(null);
  const [recallLoading, setRecallLoading] = useState(false);
  const [recallError, setRecallError] = useState<string | null>(null);
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
    setRecallReport(null);
    setRecallError(null);
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

        // 2. Recalls: the right model (hybrid and electric included), checked
        // against this car's repair orders on the server. Runs alongside the
        // rest; a failure shows as "couldn't be checked", never as "no recalls".
        setRecallLoading(true);
        fetchVinRecalls(cleanVin)
          .then(setRecallReport)
          .catch((rErr) => setRecallError(rErr instanceof Error ? rErr.message : 'Recalls could not be checked.'))
          .finally(() => setRecallLoading(false));

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
      <PageHeader
        title="VIN search"
        description="Decode a VIN to see vehicle specs, recalls and estimated value."
        breadcrumbs={[{ label: 'Sales' }, { label: 'VIN search' }]}
      />

      {/* The standard field and button — the glowing 2rem capsule with 20px
          all-caps mono placeholder was clipped at phone width ("ENTER 17-CHARACTER V"). */}
      <form onSubmit={handleSearch} className="card-base p-4 flex flex-col md:flex-row md:items-end gap-3">
        <label className="flex-1 min-w-0">
          <span className="input-label">VIN</span>
          <span className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--color-text-secondary)' }} />
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="17 characters"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="input-field pl-9 font-mono tracking-wide"
              maxLength={17}
            />
          </span>
          <span className="crm-label mt-1 block tabular-nums">{vin.length}/17</span>
        </label>
        <button type="submit" disabled={loading || vin.length < 17} className="btn-primary md:mb-6 min-h-[44px]">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <BadgeCheck size={16} />}
          Look up vehicle
        </button>
      </form>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-xs font-semibold "
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
                    <span className="text-xs font-semibold text-brand-primary ">Verified Identification</span>
                  </div>
                  
                  <h3 className="text-5xl font-semibold text-white leading-[1.1] tracking-tighter ">
                    <span className="text-brand-primary block text-2xl not-italic mb-1">{getYear()}</span>
                    {getMake()} {getModel()}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-4 text-slate-400 font-mono text-sm font-bold">
                    <div className="flex items-center gap-2 bg-white/5 py-1.5 px-4 rounded-xl border border-white/5">
                      <span className="text-slate-500">VIN</span>
                      <span className="text-white">{vin}</span>
                    </div>
                    {data.find(r => r.Variable === "Series")?.Value && (
                      <span className="text-xs bg-white/5 py-1.5 px-4 rounded-xl border border-white/5">
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

            {/* Recalls for this car's model, checked against its repair orders.
                This used to read "NO RECALLS — Fully Compliant" for every VIN. */}
            <VinRecallReport report={recallReport} loading={recallLoading} error={recallError} />
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
                  <h4 className="text-xs font-semibold text-slate-400 ">Market Value</h4>
                </div>
                {marketValue?.marketTrend && (
                  <div className={cn(
                    "px-2 py-1 rounded text-xs font-semibold border",
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
                      <p className="text-xs font-bold text-slate-500 mb-2 ">Est. Trade-In Range</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-semibold text-white tracking-tighter">${(marketValue.tradeInLow / 1000).toFixed(1)}k</span>
                        <span className="text-slate-600 font-bold mx-1">/</span>
                        <span className="text-2xl font-semibold text-brand-primary tracking-tighter">${(marketValue.tradeInHigh / 1000).toFixed(1)}k</span>
                      </div>
                    </div>

                    <div className="bg-brand-primary/5 border border-brand-primary/10 p-5 rounded-[2rem] relative overflow-hidden group">
                      <Sparkles className="absolute -right-2 -top-2 text-brand-primary/10 w-20 h-20 grayscale" />
                      <div className="flex items-center gap-2 mb-3">
                        <Maximize2 size={12} className="text-brand-primary" />
                        <span className="text-xs font-semibold text-brand-primary ">Profit Max Insight</span>
                      </div>
                      <p className="text-xs text-slate-300 font-medium leading-relaxed ">"{marketValue.advisorTip}"</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-500 ">Private Party</span>
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
                    <p className="text-xs font-semibold mt-4">Analyzing Market...</p>
                  </div>
                )}
              </div>
              
              <div className="mt-8 flex items-center gap-2 text-slate-700">
                <Info size={12} />
                <span className="text-xs font-semibold ">Regional Market Mapping Enabled</span>
              </div>
            </div>
          </div>

          {/* Efficiency & Recalls Details (Full Width Flow) */}
          <div className="lg:col-span-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Efficiency Panel */}
              <div className="p-8 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2.5rem] shadow-2xl">
                <div className="flex items-center justify-between mb-8">
                   <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-amber-500/10 rounded-xl">
                        <Fuel className="text-amber-500" size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white ">Propulsion Metrics</h4>
                        <p className="text-xs font-bold text-slate-500 mt-0.5">Source: fueleconomy.gov</p>
                      </div>
                   </div>
                </div>

                {fuelData ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/5 group hover:border-amber-500/20 transition-colors">
                      <p className="text-xs font-semibold text-slate-500 mb-2 ">City Cycle</p>
                      <p className="text-4xl font-semibold text-white tracking-tighter">{fuelData.city08}<span className="text-sm ml-1 text-slate-600 font-bold">MPG</span></p>
                    </div>
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/5 group hover:border-amber-500/20 transition-colors">
                      <p className="text-xs font-semibold text-slate-500 mb-2 ">Highway</p>
                      <p className="text-4xl font-semibold text-white tracking-tighter">{fuelData.highway08}<span className="text-sm ml-1 text-slate-600 font-bold">MPG</span></p>
                    </div>
                    <div className="p-6 bg-amber-500/10 rounded-3xl border border-amber-500/20 ring-4 ring-amber-500/5 flex flex-col justify-center">
                       <div className="flex items-center justify-between mb-1">
                         <p className="text-xs font-semibold text-amber-500 ">Combined</p>
                         <Gauge size={14} className="text-amber-500 opacity-40" />
                       </div>
                       <p className="text-4xl font-semibold text-white tracking-tighter">{fuelData.comb08}<span className="text-xs ml-1 text-amber-500 font-semibold">AVG</span></p>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center opacity-20">
                     <Loader2 className="animate-spin mb-4" size={32} />
                     <p className="text-xs font-semibold ">Fetching Diagnostics...</p>
                  </div>
                )}
              </div>

            </div>
          </div>

            {/* Full specification */}
          <div className="lg:col-span-6 space-y-6 pt-12">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-px flex-1 bg-white/5" />
              <h4 className="text-[11px] font-semibold text-slate-600 px-4 ">Full specification</h4>
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
                  <p className="text-xs font-semibold text-slate-600 group-hover:text-brand-primary/60 mb-2 truncate transition-colors">{item.Variable}</p>
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
          className="card-base flex flex-col items-center justify-center text-center px-6 py-12"
        >
          {/* No fake trust badges ("NHTSA Secure", "Live API Stream") and no
              "Diagnostic Terminal Alpha" — just what to do. */}
          <Car size={40} strokeWidth={1.5} style={{ color: 'var(--color-text-secondary)' }} />
          <h3 className="crm-section-title text-base mt-4">Look up a vehicle</h3>
          <p className="crm-label text-sm mt-1 max-w-xs">
            Enter all 17 characters of the VIN to see specs, recalls and estimated value.
          </p>
        </motion.div>
      )}

    </div>
  );
};

