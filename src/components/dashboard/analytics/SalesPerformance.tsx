import React, { useState, useMemo } from 'react';
import { Customer, User } from '../../../types';
import { 
  Trophy, 
  Users, 
  Car, 
  Search, 
  Info, 
  ChevronRight, 
  User as UserIcon, 
  Calendar, 
  DollarSign, 
  CheckCircle,
  Bell,
  ArrowRight,
  ShieldCheck,
  Award,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { PageHeader } from '../../layout/PageHeader';
import { KpiStrip } from '../../ui/KpiStrip';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import { customerMatchesDealership } from '../../../lib/customerScope';

interface SalesPerformanceProps {
  customers: Customer[];
  currentUser: User;
  currentDealershipId: string;
}

export default function SalesPerformance({ customers, currentUser, currentDealershipId }: SalesPerformanceProps) {
  const { isServiceAlertActive } = useServiceAlertHelpers();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSalesman, setSelectedSalesman] = useState<string | null>(null);

  // Filter customers to current dealership (or show all if selected)
  const dealershipCustomers = useMemo(() => {
    return customers.filter((c) => customerMatchesDealership(c, currentDealershipId));
  }, [customers, currentDealershipId]);

  // Aggregate Salesman metrics
  const salesmanData = useMemo(() => {
    const stats: Record<string, {
      name: string;
      totalSales: number;
      models: Record<string, number>;
      activeAlerts: number;
      languages: Record<string, number>;
      customers: Customer[];
    }> = {};

    dealershipCustomers.forEach(customer => {
      // Clean salesman string (can be multiple separated by slashes e.g., DIEGO/PEDRO)
      if (!customer.salesman) return;
      
      const names = customer.salesman.split('/').map(n => n.trim().toUpperCase()).filter(Boolean);
      
      names.forEach(name => {
        if (!stats[name]) {
          stats[name] = {
            name,
            totalSales: 0,
            models: {},
            activeAlerts: 0,
            languages: {},
            customers: []
          };
        }

        const s = stats[name];
        s.totalSales += 1 / names.length; // fractional count if split, or full count
        s.customers.push(customer);

        // Track model sales
        const modelName = (customer.model || 'Unknown').toUpperCase();
        s.models[modelName] = (s.models[modelName] || 0) + 1;

        // Service alert active check
        if (isServiceAlertActive(customer)) {
          s.activeAlerts += 1;
        }

        // Language tracking
        const lang = customer.language || 'English';
        s.languages[lang] = (s.languages[lang] || 0) + 1;
      });
    });

    // Convert to sorted array
    return Object.values(stats)
      .map(s => {
        // Find favorite vehicle model
        let favModel = 'N/A';
        let maxCount = 0;
        Object.entries(s.models).forEach(([model, count]) => {
          if (count > maxCount) {
            maxCount = count;
            favModel = model;
          }
        });

        // Retention / Service Adoption Rate
        // percentage of their customers who have NOT triggered an active service alert,
        // or have logged recent service visits.
        const activeOpportunityRate = s.totalSales > 0 ? (s.activeAlerts / s.customers.length) * 100 : 0;
        const serviceMatchingRate = s.totalSales > 0 ? 100 - activeOpportunityRate : 100;

        return {
          ...s,
          favModel,
          serviceMatchingRate: Math.round(serviceMatchingRate)
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [dealershipCustomers, isServiceAlertActive]);

  // Filtered salesman stats
  const filteredSalesmen = useMemo(() => {
    return salesmanData.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.favModel.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [salesmanData, searchTerm]);

  // Find selected salesman details
  const activeSalesmanDetails = useMemo(() => {
    if (!selectedSalesman) return null;
    return salesmanData.find(s => s.name === selectedSalesman) || null;
  }, [salesmanData, selectedSalesman]);

  // Top overall stats
  const overallMetrics = useMemo(() => ({
    totalDeliveries: dealershipCustomers.length,
  }), [dealershipCustomers]);

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Sales performance"
        description="Delivery volume, rep leaderboard, and service adoption across your CRM fleet."
        breadcrumbs={[{ label: 'Sales' }, { label: 'Performance' }]}
      />

      <KpiStrip
        columns={2}
        tiles={[
          { label: 'Dealership fleet', value: overallMetrics.totalDeliveries.toLocaleString(), tone: 'info' },
          { label: 'Active sales reps', value: salesmanData.length.toLocaleString(), tone: 'success' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Leaderboard Column - spans 2 on desktop */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Trophy className="text-brand-primary" size={18} /> Sales Champion Leaderboard
              </h3>
              <p className="text-xs text-slate-400 mt-1">Representatives ranked by total deliveries, customer retention, and service compliance.</p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-primary" size={14} />
              <input
                type="text"
                placeholder="Search advisor or favorite model..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-primary font-medium"
              />
            </div>
          </div>

          <div className="card-base p-0 overflow-hidden border-slate-800/60 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/40 border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] select-none">
                    <th className="px-6 py-4">Rank & Professional</th>
                    <th className="px-6 py-4 text-center">Deliveries</th>
                    <th className="px-6 py-4">Top Vehicle Sold</th>
                    <th className="px-6 py-4 text-center">S2S Retention</th>
                    <th className="px-6 py-4 text-center">Active Alerts</th>
                    <th className="px-6 py-4 text-right">Drilldown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredSalesmen.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-xs font-medium">
                        No automotive sales representatives matched selection criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredSalesmen.map((rep, index) => {
                      const isTopRank = index === 0 && rep.totalSales > 0;
                      const isSelected = selectedSalesman === rep.name;

                      return (
                        <tr 
                          key={rep.name} 
                          onClick={() => setSelectedSalesman(rep.name)}
                          className={cn(
                            "cursor-pointer transition-colors group/row",
                            isSelected ? "bg-brand-primary/10 hover:bg-brand-primary/15" : "hover:bg-slate-900/30"
                          )}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] border shrink-0",
                                isTopRank 
                                  ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30 animate-pulse" 
                                  : "bg-slate-950 border-white/5 text-slate-500"
                              )}>
                                {isTopRank ? "🏆" : index + 1}
                              </span>
                              <div className="flex flex-col">
                                <span className={cn(
                                  "text-xs font-black uppercase tracking-wide",
                                  isSelected ? "text-brand-primary" : "text-white group-hover/row:text-brand-primary transition-colors"
                                )}>
                                  {rep.name}
                                </span>
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
                                  {rep.customers.length} Accounts Monitored
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center font-mono text-xs font-bold text-white">
                            {Math.round(rep.totalSales)}
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-300">
                            <span className="bg-slate-950 text-slate-400 px-2.5 py-1 rounded-lg border border-white/5 font-mono text-[9px] uppercase tracking-wide">
                              {rep.favModel}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={cn(
                                "text-xs font-black font-mono",
                                rep.serviceMatchingRate >= 80 ? "text-emerald-500" : rep.serviceMatchingRate >= 50 ? "text-amber-500" : "text-rose-500"
                              )}>
                                {rep.serviceMatchingRate}%
                              </span>
                              <div className="w-12 h-1 bg-slate-950 rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full rounded-full",
                                    rep.serviceMatchingRate >= 80 ? "bg-emerald-500" : rep.serviceMatchingRate >= 50 ? "bg-amber-500" : "bg-rose-500"
                                  )}
                                  style={{ width: `${rep.serviceMatchingRate}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={cn(
                              "text-[10px] font-black font-mono px-2 py-0.5 rounded-md border",
                              rep.activeAlerts > 0 
                                ? "bg-rose-500/10 text-rose-500 border-rose-500/20" 
                                : "bg-slate-950 text-slate-500 border-transparent"
                            )}>
                              {rep.activeAlerts}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="text-slate-500 group-hover/row:text-white group-hover/row:translate-x-1 transition-all">
                              <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Drilldown Details Panel */}
        <div className="lg:col-span-1 space-y-6">
          <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Info className="text-brand-secondary" size={18} /> Representative Profiles
          </h3>

          <AnimatePresence mode="wait">
            {!selectedSalesman ? (
              <motion.div 
                key="select-prompt"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="card-base p-8 text-center border-dashed border-slate-800 bg-transparent flex flex-col items-center justify-center h-96"
              >
                <div className="p-4 bg-slate-950 rounded-full text-slate-600 mb-4 border border-white/5">
                  <UserIcon size={32} />
                </div>
                <h4 className="text-sm font-black text-white uppercase tracking-wide">Salesperson Drilldown Portal</h4>
                <p className="text-slate-500 text-[10px] mt-2 max-w-xs mx-auto leading-relaxed">
                  Select a registered sales representative from the leaderboard on the left to inspect their managed accounts, check alert statuses, and read customer notes.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key={selectedSalesman}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {/* Rep Header Card */}
                <div className="card-base p-6 border-brand-primary bg-brand-primary/5 hover:border-brand-primary/35 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
                      <Award size={24} />
                    </div>
                    <div>
                      <span className="text-[8px] font-black text-brand-primary uppercase tracking-[0.25em]">Automotive Advisor Profile</span>
                      <h4 className="text-lg font-black text-white uppercase mt-0.5">{selectedSalesman}</h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/5 text-center">
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Deliveries</p>
                      <p className="text-xl font-mono font-black text-white mt-1">
                        {Math.round(activeSalesmanDetails?.totalSales || 0)}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">S2S Retention</p>
                      <p className="text-xl font-mono font-black text-brand-secondary mt-1">
                        {activeSalesmanDetails?.serviceMatchingRate}%
                      </p>
                    </div>
                  </div>
                </div>

                {/*Managed Customers List */}
                <div className="space-y-3">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Managed Account Directory</span>
                  
                  <div className="space-y-2.5 max-h-[28rem] overflow-y-auto pr-1">
                    {activeSalesmanDetails?.customers.map(c => {
                      const alertActive = isServiceAlertActive(c);
                      return (
                        <div 
                          key={c.id}
                          className={cn(
                            "p-4 bg-slate-900/60 border rounded-2xl space-y-3 relative overflow-hidden group/cust",
                            alertActive ? "border-rose-500/15 hover:border-rose-500/30" : "border-slate-800 hover:border-slate-700"
                          )}
                        >
                          {alertActive && (
                            <div className="absolute top-0 right-0 p-1.5 bg-rose-500 text-slate-950 font-black text-[7px] uppercase tracking-wider rounded-bl-xl select-none leading-none">
                              Alert
                            </div>
                          )}
                          
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs font-black text-white group-hover/cust:text-brand-primary transition-colors uppercase italic">{c.firstName} {c.lastName}</p>
                              <span className="inline-block text-[8px] font-mono text-slate-400 font-bold uppercase mt-1 leading-none">{c.year} {c.model} &bull; <span className="text-brand-secondary">{c.vinLast8}</span></span>
                            </div>
                          </div>

                          {/* Customer note popup inline display */}
                          {c.notes && (
                            <div className="p-3 bg-slate-950/80 rounded-xl border border-white/5 space-y-1">
                              <span className="text-[8px] font-black text-brand-secondary uppercase tracking-widest block select-none">Sales Representative Customer Note</span>
                              <p className="text-[10px] font-medium text-slate-300 italic leading-relaxed">
                                "{c.notes}"
                              </p>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold pt-2 border-t border-white/5">
                            <span>Phone: {c.phone || "No Phone"}</span>
                            <span>Alert: <span className={alertActive ? "text-rose-400 font-black" : "text-emerald-400 font-bold"}>{alertActive ? "TRIGGERED" : "HEALTHY"}</span></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
