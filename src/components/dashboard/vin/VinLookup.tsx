import React, { useState } from 'react';
import { Search, Loader2, BadgeCheck, Car, Info, AlertTriangle, ListFilter, Fuel, Zap, Droplets, Gauge, DollarSign, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VinData {
  Variable: string;
  Value: string;
}

export const VinLookup: React.FC = () => {
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VinData[] | null>(null);
  const [recalls, setRecalls] = useState<any[] | null>(null);
  const [recallsExpanded, setRecallsExpanded] = useState(false);
  const [fuelData, setFuelData] = useState<any | null>(null);
  const [marketValue, setMarketValue] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValuing, setIsValuing] = useState(false);

  const getMake = () => data?.find(r => (r.Variable === "Make" || r.Variable === "Vehicle Make"))?.Value;
  const getModel = () => data?.find(r => (r.Variable === "Model" || r.Variable === "Vehicle Model"))?.Value;
  const getYear = () => data?.find(r => (r.Variable === "Model Year" || r.Variable === "Vehicle Year"))?.Value;

  const getCarImageUrl = () => {
    const makeVal = getMake()?.toLowerCase();
    const modelVal = getModel()?.toLowerCase();
    const yearVal = getYear();
    if (!makeVal || !modelVal) return '';
    
    // Most reliable for Imagin Studio: first word of model only
    const modelFamily = modelVal.split(' ')[0].replace(/[^a-z0-9]/gi, '');
    
    return `https://cdn.imagin.studio/getimage?customer=img-demo&make=${makeVal}&modelFamily=${modelFamily}&modelYear=${yearVal}&zoomType=fullscreen&angle=22`;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vin || vin.length < 17) return;

    setLoading(true);
    setError(null);
    setRecalls(null);
    setRecallsExpanded(false);
    setFuelData(null);
    setMarketValue(null);
    try {
      // 1. Decode VIN
      const decodeRes = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
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
          const recallRes = await fetch(`https://api.nhtsa.gov/recalls/recallsByVin?vin=${vin}`);
          const recallData = await recallRes.json();
          let foundRecalls = recallData.results || recallData.Results || [];
          if (foundRecalls.length === 0 && make && model && year) {
            const modelRecallRes = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${make}&model=${model}&modelYear=${year}`);
            const modelRecallData = await modelRecallRes.json();
            foundRecalls = modelRecallData.results || modelRecallData.Results || [];
            if (foundRecalls.length > 0) {
              foundRecalls = foundRecalls.map((r: any) => ({ ...r, isModelLevel: true }));
            }
          }
          setRecalls(foundRecalls);
        } catch (rErr) {
          console.error("Recall fetch failed", rErr);
        }

        // 3. Fetch Fuel Economy Data
        if (make && model && year) {
          try {
            // First find the vehicle ID
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

          // 5. Fetch Valuation (Conceptual AI powered)
          try {
            setIsValuing(true);
            const valRes = await fetch('/api/estimate-value', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                year,
                make,
                model,
                trim: data?.find(r => r.Variable === "Series")?.Value || "",
                mileage: data?.find(r => r.Variable === "Mileage")?.Value || "15000" // Fallback mileage
              })
            });
            const valData = await valRes.json();
            setMarketValue(valData);
          } catch (vErr) {
            console.error("Valuation fetch failed", vErr);
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
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <div className="p-2 bg-brand-primary/10 rounded-lg">
            <Search className="text-brand-primary" size={20} />
          </div>
          Global VIN & Recall Decoder
        </h2>
        <p className="text-slate-500 text-sm mt-1">NHTSA Data + Fueleconomy.gov + AI Image Mapping</p>
      </header>

      <div className="card-base p-6">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="Enter 17-character VIN..."
              className="input-field pl-12 font-mono uppercase tracking-widest text-lg"
              maxLength={17}
            />
          </div>
          <button 
            type="submit"
            disabled={loading || vin.length < 17}
            className="btn-primary py-4 px-8 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <BadgeCheck size={20} />}
            Decode Vehicle
          </button>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-sm">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {data && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          
          {/* Hero Section: Primary Info */}
          <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 to-slate-950 p-10 rounded-3xl border border-slate-800 flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <Car size={160} />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-6 mb-6">
                  <div className="p-5 bg-brand-primary/10 rounded-2xl backdrop-blur-md border border-brand-primary/20">
                    <Car className="text-brand-primary" size={40} />
                  </div>
                  <div>
                    <h3 className="text-4xl font-black text-white leading-tight uppercase tracking-tighter">
                      {getYear()} {getMake()} {getModel()}
                    </h3>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-slate-500 font-mono text-sm uppercase tracking-[0.2em]">{vin}</span>
                      <BadgeCheck className="text-brand-primary" size={16} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fuel Economy Stats */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl border border-slate-800/50 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Fuel className="text-amber-500" size={18} />
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Efficiency Metrics</h4>
                </div>
                
                {fuelData ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30">
                        <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">City MPG</p>
                        <p className="text-2xl font-black text-white">{fuelData.city08 || '--'}</p>
                      </div>
                      <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30">
                        <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Highway MPG</p>
                        <p className="text-2xl font-black text-white">{fuelData.highway08 || '--'}</p>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Combined Rating</p>
                        <Gauge size={14} className="text-amber-500" />
                      </div>
                      <p className="text-3xl font-black text-white">{fuelData.comb08 || '--'} <span className="text-xs font-bold text-slate-500">MPG</span></p>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                      <div className="flex items-center gap-1">
                        <Droplets size={12} className="text-slate-600" />
                        <span>{fuelData.fuelType1 || 'Gasoline'}</span>
                      </div>
                      {fuelData.evMotor && (
                        <div className="flex items-center gap-1">
                          <Zap size={12} className="text-brand-primary" />
                          <span>EV Supplement</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-700">
                    <Info size={32} className="mb-2 opacity-20" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">Data Unavailable</p>
                  </div>
                )}
              </div>
              
              <p className="text-[8px] text-slate-600 font-bold uppercase mt-4">Source: fueleconomy.gov</p>
            </div>

            {/* Smart Market Valuation */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl border border-slate-800/50 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="text-brand-primary" size={18} />
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Market Valuation</h4>
                </div>
                {isValuing && <Loader2 className="animate-spin text-brand-primary" size={14} />}
              </div>

              {marketValue ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Trade-In Range</p>
                      <p className="text-xl font-black text-brand-primary">
                        ${(marketValue.tradeInLow / 1000).toFixed(1)}k - ${(marketValue.tradeInHigh / 1000).toFixed(1)}k
                      </p>
                    </div>
                    {marketValue.marketTrend && (
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                        marketValue.marketTrend === 'Rising' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/20' :
                        marketValue.marketTrend === 'Falling' ? 'bg-red-500/20 text-red-500 border border-red-500/20' :
                        'bg-slate-500/20 text-slate-500 border border-slate-500/20'
                      }`}>
                        Trend: {marketValue.marketTrend}
                      </span>
                    )}
                  </div>

                  <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 relative overflow-hidden group">
                    <div className="absolute -right-2 -top-2 opacity-5 scale-150 group-hover:rotate-12 transition-transform">
                      <Sparkles size={48} />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={12} className="text-brand-primary" />
                      <p className="text-[9px] font-black text-brand-primary uppercase tracking-widest">Advisor insight</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">
                      "{marketValue.advisorTip}"
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/50 flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                    <span>Private Party</span>
                    <span className="text-slate-300">
                      ${(marketValue.privatePartyLow / 1000).toFixed(1)}k - ${(marketValue.privatePartyHigh / 1000).toFixed(1)}k
                    </span>
                  </div>
                </div>
              ) : isValuing ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-700 animate-pulse">
                   <DollarSign size={32} className="mb-2 opacity-20" />
                   <p className="text-[10px] font-bold uppercase tracking-widest">Generating Valuation...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-700">
                   <Info size={32} className="mb-2 opacity-20" />
                   <p className="text-[10px] font-bold uppercase tracking-widest">Awaiting Analysis</p>
                </div>
              )}
            </div>
          </div>

          {/* Recall Section */}
          <div className="md:col-span-2 lg:col-span-3">
             {recalls && recalls.length > 0 ? (
                <div className="space-y-4">
                  <button 
                    onClick={() => setRecallsExpanded(!recallsExpanded)}
                    className="w-full flex items-center justify-between p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl hover:bg-rose-500/15 transition-colors group"
                  >
                    <div className="flex items-center gap-4 text-rose-500">
                      <AlertTriangle size={24} className="group-hover:animate-bounce" />
                      <div className="text-left">
                        <h4 className="text-sm font-black uppercase tracking-widest">{recalls.length} SAFETY RECALLS IDENTIFIED</h4>
                        <p className="text-[10px] font-bold text-rose-400/60 uppercase tracking-tighter mt-0.5">Click to view detailed campaign summaries</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {recalls[0].isModelLevel && (
                        <span className="hidden sm:inline-block text-[9px] font-black bg-amber-500/20 text-amber-500 px-3 py-1 rounded-full border border-amber-500/40 uppercase tracking-tighter">
                          Model-Wide Data
                        </span>
                      )}
                      <div className={`p-2 rounded-lg bg-rose-500/20 transition-transform ${recallsExpanded ? 'rotate-180' : ''}`}>
                        <Info size={16} />
                      </div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {recallsExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                          {recalls.map((recall, i) => (
                            <div key={i} className="p-5 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                              <div className="flex justify-between items-start mb-3">
                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">NHTSA #{recall.NHTSACampaignNumber}</span>
                                <span className="text-[10px] font-bold text-slate-500">{recall.ReportReceivedDate}</span>
                              </div>
                              <h5 className="text-sm font-bold text-white mb-2 leading-snug">{recall.Component}</h5>
                              <p className="text-xs text-slate-400 line-clamp-3 mb-4">{recall.Summary}</p>
                              <div className="p-4 bg-rose-500/10 rounded-xl border border-rose-500/10">
                                <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1.5">Action Required</p>
                                <p className="text-xs text-slate-300 leading-relaxed">{recall.Remedy}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
             ) : (
               <div className="flex items-center gap-3 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-500">
                 <BadgeCheck size={24} />
                 <div>
                   <span className="text-sm font-black uppercase tracking-widest block">Clean Vehicle Record</span>
                   <span className="text-[10px] font-bold opacity-60 uppercase tracking-tighter">No open recalls identified in NHTSA database</span>
                 </div>
               </div>
             )}
          </div>

          <div className="md:col-span-2 lg:col-span-3 mt-4 pt-4 border-t border-slate-800">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Vehicle Specification Details</h4>
          </div>

          {data.map((item, idx) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
              key={idx} 
              className="p-4 bg-slate-900/30 border border-slate-800/50 rounded-xl hover:border-slate-700 transition-colors"
            >
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{item.Variable}</p>
              <p className="text-sm font-bold text-slate-200">{item.Value}</p>
            </motion.div>
          ))}
        </div>
      )}
      
      {!data && !loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 rounded-3xl border-2 border-dashed border-slate-800/50">
          <Car size={48} className="text-slate-800 mb-4" />
          <p className="text-slate-600 font-medium">Enter a VIN above to start exploration</p>
        </div>
      )}
    </div>
  );
};
