import React, { useState, useMemo } from 'react';
import { Customer, User } from '../../../types';
import {
  Trophy,
  Search,
  Info,
  ChevronRight,
  User as UserIcon,
  Award,
  BarChart3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '../../../lib/utils';
import { PageHeader } from '../../layout/PageHeader';
import { KpiStrip } from '../../ui/KpiStrip';
import { EmptyState } from '../../ui/EmptyState';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import { customerMatchesDealership } from '../../../lib/customerScope';
import { formatCustomerDisplayName } from '../../../lib/customerName';

interface SalesPerformanceProps {
  customers: Customer[];
  currentUser: User;
  currentDealershipId: string;
}

// Bar fill colors — brand hues stay constant across light/dark (see index.css),
// matching the categorical convention already used by PotOfGold/FixedOpsForecast charts.
const CHART_BAR_COLOR = '#3b82f6';
const CHART_BAR_HIGHLIGHT_COLOR = '#60a5fa';
const CHART_TOP_N = 8;

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

  // Top overall stats — includes a couple of lightweight averages derived from
  // salesmanData so the KPI strip isn't just a duplicate of the chart below it.
  const overallMetrics = useMemo(() => {
    const totalDeliveries = dealershipCustomers.length;
    const activeReps = salesmanData.length;
    const avgDeliveriesPerRep = activeReps > 0 ? totalDeliveries / activeReps : 0;
    const avgServiceRetention = activeReps > 0
      ? Math.round(salesmanData.reduce((sum, s) => sum + s.serviceMatchingRate, 0) / activeReps)
      : 0;
    return { totalDeliveries, activeReps, avgDeliveriesPerRep, avgServiceRetention };
  }, [dealershipCustomers, salesmanData]);

  // Chart data — top N reps (respecting the active search) ranked by deliveries.
  const chartData = useMemo(() => (
    filteredSalesmen.slice(0, CHART_TOP_N).map(s => ({ name: s.name, deliveries: Math.round(s.totalSales) }))
  ), [filteredSalesmen]);

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Sales performance"
        description="Delivery volume, rep leaderboard, and service adoption across your CRM fleet."
        breadcrumbs={[{ label: 'Sales' }, { label: 'Performance' }]}
      />

      <KpiStrip
        columns={4}
        tiles={[
          { label: 'Dealership fleet', value: overallMetrics.totalDeliveries.toLocaleString(), tone: 'info' },
          { label: 'Active sales reps', value: overallMetrics.activeReps.toLocaleString(), tone: 'success' },
          { label: 'Avg deliveries / rep', value: overallMetrics.avgDeliveriesPerRep.toFixed(1), sublabel: 'Fleet ÷ active reps' },
          {
            label: 'Avg service retention',
            value: `${overallMetrics.avgServiceRetention}%`,
            tone: overallMetrics.avgServiceRetention >= 80 ? 'success' : overallMetrics.avgServiceRetention >= 50 ? 'warning' : 'default',
          },
        ]}
      />

      {/* Delivery distribution chart — clarifies the leaderboard at a glance */}
      <div className="card-base p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h3 className="crm-section-title flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-primary" />
            Delivery distribution
          </h3>
          <p className="crm-label text-[11px]">
            {chartData.length > 0
              ? `Top ${chartData.length} of ${filteredSalesmen.length} matching rep${filteredSalesmen.length === 1 ? '' : 's'}`
              : null}
          </p>
        </div>

        {chartData.length === 0 ? (
          <p className="crm-label text-center py-10">No delivery data to chart yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 42)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" horizontal={false} />
              <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={110}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-surface-hover)' }}
                contentStyle={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', borderRadius: '12px' }}
                itemStyle={{ color: 'var(--color-text-primary)', fontSize: '12px', fontWeight: 'bold' }}
                labelStyle={{ color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: 600, marginBottom: 4 }}
                formatter={(value: number) => [`${value}`, 'Deliveries']}
              />
              <Bar
                dataKey="deliveries"
                name="Deliveries"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(data: any) => setSelectedSalesman(data.name)}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.name === selectedSalesman ? CHART_BAR_HIGHLIGHT_COLOR : CHART_BAR_COLOR}
                    fillOpacity={entry.name === selectedSalesman ? 1 : 0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Leaderboard Column - spans 2 on desktop */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="crm-section-title flex items-center gap-2">
                <Trophy className="text-brand-primary" size={18} /> Sales champion leaderboard
              </h3>
              <p className="crm-label mt-1">Representatives ranked by total deliveries, customer retention, and service compliance.</p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-primary" size={14} />
              <input
                type="text"
                placeholder="Search advisor or favorite model..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="input-field pl-10 text-xs py-2"
              />
            </div>
          </div>

          {filteredSalesmen.length === 0 ? (
            <EmptyState
              title="No sales representatives matched"
              description="Try a different name or vehicle model, or clear your search to see the full leaderboard."
              action={searchTerm ? (
                <button type="button" onClick={() => setSearchTerm('')} className="btn-secondary">
                  Clear search
                </button>
              ) : undefined}
            />
          ) : (
            <>
              {/* Desktop — full leaderboard table */}
              <div className="hidden lg:block card-base p-0 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Rank & professional</th>
                        <th className="text-center">Deliveries</th>
                        <th>Top vehicle sold</th>
                        <th className="text-center">S2S retention</th>
                        <th className="text-center">Active alerts</th>
                        <th className="text-right">Drilldown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSalesmen.map((rep, index) => {
                        const isTopRank = index === 0 && rep.totalSales > 0;
                        const isSelected = selectedSalesman === rep.name;

                        return (
                          <tr
                            key={rep.name}
                            onClick={() => setSelectedSalesman(rep.name)}
                            className="cursor-pointer group/row"
                            style={isSelected ? { backgroundColor: 'var(--color-surface-hover)' } : undefined}
                          >
                            <td>
                              <div className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    "w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] border shrink-0",
                                    isTopRank
                                      ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30 animate-pulse"
                                      : "border-transparent"
                                  )}
                                  style={!isTopRank ? { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-tertiary)' } : undefined}
                                >
                                  {isTopRank ? <Trophy size={12} /> : index + 1}
                                </span>
                                <div className="flex flex-col">
                                  <span className={cn(
                                    "text-xs font-black uppercase tracking-wide",
                                    isSelected ? "text-brand-primary" : "group-hover/row:text-brand-primary transition-colors"
                                  )}>
                                    {rep.name}
                                  </span>
                                  <span className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                                    {rep.customers.length} Accounts Monitored
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="text-center font-mono text-xs font-bold">
                              {Math.round(rep.totalSales)}
                            </td>
                            <td className="text-xs font-bold">
                              <span
                                className="px-2.5 py-1 rounded-lg border font-mono text-[9px] uppercase tracking-wide"
                                style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}
                              >
                                {rep.favModel}
                              </span>
                            </td>
                            <td className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={cn(
                                  "text-xs font-black font-mono",
                                  rep.serviceMatchingRate >= 80 ? "text-emerald-500" : rep.serviceMatchingRate >= 50 ? "text-amber-500" : "text-rose-500"
                                )}>
                                  {rep.serviceMatchingRate}%
                                </span>
                                <div className="w-12 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
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
                            <td className="text-center">
                              <span
                                className={cn(
                                  "text-[10px] font-black font-mono px-2 py-0.5 rounded-md border",
                                  rep.activeAlerts > 0
                                    ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                    : "border-transparent"
                                )}
                                style={rep.activeAlerts === 0 ? { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-tertiary)' } : undefined}
                              >
                                {rep.activeAlerts}
                              </span>
                            </td>
                            <td className="text-right">
                              <button className="group-hover/row:text-brand-primary group-hover/row:translate-x-1 transition-all" style={{ color: 'var(--color-text-tertiary)' }}>
                                <ChevronRight size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile / tablet — ranked card list, no horizontal scrolling */}
              <div className="lg:hidden space-y-2">
                {filteredSalesmen.map((rep, index) => {
                  const isTopRank = index === 0 && rep.totalSales > 0;
                  const isSelected = selectedSalesman === rep.name;

                  return (
                    <motion.button
                      key={rep.name}
                      type="button"
                      onClick={() => setSelectedSalesman(rep.name)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.03, 0.5) }}
                      className={cn(
                        "card-base card-interactive w-full flex items-center gap-3 p-3.5 text-left",
                        isSelected && "border-brand-primary bg-brand-primary/5"
                      )}
                    >
                      <span
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs border shrink-0",
                          isTopRank
                            ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30"
                            : "border-transparent"
                        )}
                        style={!isTopRank ? { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-tertiary)' } : undefined}
                      >
                        {isTopRank ? <Trophy size={14} /> : index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-bold truncate", isSelected && "text-brand-primary")}>{rep.name}</p>
                        <p className="crm-label text-[11px] truncate mt-0.5">
                          {rep.favModel} · {rep.customers.length} accounts
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">{Math.round(rep.totalSales)}</p>
                        <p className={cn(
                          "text-[10px] font-semibold tabular-nums",
                          rep.serviceMatchingRate >= 80 ? "text-emerald-500" : rep.serviceMatchingRate >= 50 ? "text-amber-500" : "text-rose-500"
                        )}>
                          {rep.serviceMatchingRate}% retention
                        </p>
                        {rep.activeAlerts > 0 && (
                          <p className="text-[10px] font-semibold text-rose-500">{rep.activeAlerts} alert{rep.activeAlerts === 1 ? '' : 's'}</p>
                        )}
                      </div>
                      <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
                    </motion.button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Drilldown Details Panel */}
        <div className="lg:col-span-1 space-y-6">
          <h3 className="crm-section-title flex items-center gap-2">
            <Info className="text-brand-secondary" size={18} /> Representative profiles
          </h3>

          <AnimatePresence mode="wait">
            {!selectedSalesman ? (
              <motion.div
                key="select-prompt"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="card-base border-dashed p-8 text-center bg-transparent flex flex-col items-center justify-center h-96"
              >
                <div
                  className="p-4 rounded-full mb-4 border"
                  style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-tertiary)', borderColor: 'var(--color-surface-border)' }}
                >
                  <UserIcon size={32} />
                </div>
                <h4 className="crm-section-title">Salesperson drilldown portal</h4>
                <p className="crm-label text-[10px] mt-2 max-w-xs mx-auto leading-relaxed">
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
                      <span className="text-[8px] font-black text-brand-primary uppercase tracking-[0.25em]">Automotive advisor profile</span>
                      <h4 className="text-lg font-black uppercase mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{selectedSalesman}</h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t text-center" style={{ borderColor: 'var(--color-surface-border)' }}>
                    <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}>
                      <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>Deliveries</p>
                      <p className="text-xl font-mono font-black mt-1" style={{ color: 'var(--color-text-primary)' }}>
                        {Math.round(activeSalesmanDetails?.totalSales || 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}>
                      <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>S2S retention</p>
                      <p className="text-xl font-mono font-black text-brand-secondary mt-1">
                        {activeSalesmanDetails?.serviceMatchingRate}%
                      </p>
                    </div>
                  </div>
                </div>

                {/*Managed Customers List */}
                <div className="space-y-3">
                  <span className="crm-label text-[9px] uppercase tracking-widest">Managed account directory</span>

                  <div className="space-y-2.5 max-h-[28rem] overflow-y-auto pr-1">
                    {activeSalesmanDetails?.customers.map(c => {
                      const alertActive = isServiceAlertActive(c);
                      return (
                        <div
                          key={c.id}
                          className={cn(
                            "p-4 border rounded-2xl space-y-3 relative overflow-hidden group/cust",
                            alertActive ? "border-rose-500/15 hover:border-rose-500/30" : "hover:border-brand-primary/20"
                          )}
                          style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: alertActive ? undefined : 'var(--color-surface-border)' }}
                        >
                          {alertActive && (
                            <div className="absolute top-0 right-0 p-1.5 bg-rose-500 text-slate-950 font-black text-[7px] uppercase tracking-wider rounded-bl-xl select-none leading-none">
                              Alert
                            </div>
                          )}

                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs font-black group-hover/cust:text-brand-primary transition-colors uppercase italic" style={{ color: 'var(--color-text-primary)' }}>{formatCustomerDisplayName(c.firstName, c.lastName)}</p>
                              <span className="inline-block text-[8px] font-mono font-bold uppercase mt-1 leading-none" style={{ color: 'var(--color-text-tertiary)' }}>{c.year} {c.model} &bull; <span className="text-brand-secondary">{c.vinLast8}</span></span>
                            </div>
                          </div>

                          {/* Customer note popup inline display */}
                          {c.notes && (
                            <div className="p-3 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}>
                              <span className="text-[8px] font-black text-brand-secondary uppercase tracking-widest block select-none">Sales representative customer note</span>
                              <p className="text-[10px] font-medium italic leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                                "{c.notes}"
                              </p>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[9px] font-bold pt-2 border-t" style={{ color: 'var(--color-text-tertiary)', borderColor: 'var(--color-surface-border)' }}>
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
