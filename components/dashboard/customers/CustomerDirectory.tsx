import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Users, ChevronRight, Phone, Mail, Car, Wrench, History, Edit2,
  AlertTriangle, MessageCircle, TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, User } from '../../../types';
import { cn } from '../../../lib/utils';
import { PageHeader } from '../../layout/PageHeader';
import { EmptyState } from '../../ui/EmptyState';
import {
  directoryMakeFiltersForDealership,
  DirectoryMakeFilter,
  matchesDirectoryMakeFilter,
} from '../../../lib/directoryMakeFilters';
import { formatCustomerDisplayName, customerDisplayInitials } from '../../../lib/customerName';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import { getCustomerAlertDueDate } from '../../../lib/alerts';
import { parseReminderDate } from '../../../lib/serviceReminder';
import { getRecommendedServices, getMonthsOwned } from '../../../lib/maintenance';

interface CustomerDirectoryProps {
  customers: Customer[];
  currentUser: User;
  currentDealershipId: string;
  onViewProfile: (customer: Customer) => void;
  onViewLog: (customer: Customer) => void;
  onRefresh: (msg: string, isError?: boolean) => void;
}

type ServiceTier = 'ok' | 'soon' | 'overdue';

interface ServiceStatus {
  tier: ServiceTier;
  label: string;
  milestone: string;
}

/** Returns a Timestamp-or-string/Date value as milliseconds, or 0 if unparseable. */
function toMillis(d: unknown): number {
  if (!d) return 0;
  if (typeof d === 'object' && d !== null && 'toDate' in (d as any)) {
    try {
      return (d as any).toDate().getTime();
    } catch {
      return 0;
    }
  }
  const date = new Date(d as any);
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

function isThisMonth(millis: number): boolean {
  if (!millis) return false;
  const d = new Date(millis);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function getCustomerServiceStatus(
  customer: Customer,
  config: Parameters<typeof getCustomerAlertDueDate>[1],
  milestoneLabel: string
): ServiceStatus {
  if (!customer.enableServiceAlert) {
    return { tier: 'ok', label: 'No alert scheduled', milestone: 'Service alerts are off for this customer.' };
  }

  const dueStr = getCustomerAlertDueDate(customer, config);
  const due = dueStr ? parseReminderDate(dueStr) : null;
  if (!due) {
    return { tier: 'ok', label: 'On track', milestone: 'No service history on file yet.' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (daysUntil < 0) {
    const overdueBy = Math.abs(daysUntil);
    return {
      tier: 'overdue',
      label: 'Overdue',
      milestone: `Service due ${milestoneLabel} — ${overdueBy} day${overdueBy === 1 ? '' : 's'} past due`,
    };
  }
  if (daysUntil <= 14) {
    return {
      tier: 'soon',
      label: 'Due soon',
      milestone: daysUntil === 0 ? `Service due today (${milestoneLabel})` : `Service due ${milestoneLabel} — in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
    };
  }
  return { tier: 'ok', label: 'On track', milestone: `Next service ${milestoneLabel}` };
}

function StatusBadge({ status, className }: { status: ServiceStatus; className?: string }) {
  const badgeClass = status.tier === 'overdue' ? 'badge-error' : status.tier === 'soon' ? 'badge-warning' : 'badge-success';
  const dotClass = status.tier === 'overdue' ? 'bg-rose-500' : status.tier === 'soon' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <span className={cn('badge text-[10px] shrink-0 inline-flex items-center gap-1.5', badgeClass, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dotClass)} />
      {status.label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  subClassName,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  subClassName?: string;
}) {
  return (
    <div className="card-base px-5 py-4">
      <p className="crm-label">{label}</p>
      <p className="crm-kpi-value text-3xl mt-1 tabular-nums">{value}</p>
      {sub && <p className={cn('crm-label mt-1.5', subClassName)}>{sub}</p>}
    </div>
  );
}

function DetailPanel({
  customer,
  status,
  onViewProfile,
  onViewLog,
}: {
  customer: Customer;
  status: ServiceStatus;
  onViewProfile: (c: Customer) => void;
  onViewLog: (c: Customer) => void;
}) {
  const monthsOwned = getMonthsOwned(customer.soldDate);
  const roadmap = getRecommendedServices(monthsOwned);
  const timeline = (customer.recentVisits || []).slice(0, 4);
  const statusCardClass =
    status.tier === 'overdue' ? 'bg-rose-500/10 border-rose-500/20' :
    status.tier === 'soon' ? 'bg-amber-500/10 border-amber-500/20' :
    'border-dashed';
  const statusDotClass = status.tier === 'overdue' ? 'bg-rose-500' : status.tier === 'soon' ? 'bg-amber-500' : 'bg-emerald-500';
  const statusTitleClass = status.tier === 'overdue' ? 'text-rose-500' : status.tier === 'soon' ? 'text-amber-500' : 'text-emerald-500';

  return (
    <div className="card-base overflow-hidden lg:sticky lg:top-[74px]">
      <div className="p-5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-black text-white shrink-0 bg-gradient-to-br from-brand-primary to-blue-700">
            {customerDisplayInitials(customer.firstName, customer.lastName)}
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={`tel:${customer.phone}`}
              className="w-8 h-8 flex items-center justify-center rounded-lg btn-secondary p-0"
              title="Call"
            >
              <Phone size={13} />
            </a>
            <button
              type="button"
              onClick={() => onViewLog(customer)}
              className="w-8 h-8 flex items-center justify-center rounded-lg btn-secondary p-0"
              title="View interaction log"
            >
              <History size={13} />
            </button>
            <button
              type="button"
              onClick={() => onViewProfile(customer)}
              className="w-8 h-8 flex items-center justify-center rounded-lg btn-secondary p-0"
              title="Edit profile"
            >
              <Edit2 size={13} />
            </button>
          </div>
        </div>
        <p className="text-base font-bold leading-tight">{formatCustomerDisplayName(customer.firstName, customer.lastName)}</p>
        <span className={cn(
          'inline-flex mt-2 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border',
          customer.language === 'Spanish' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-slate-100 dark:bg-slate-800/50 text-slate-500 border-slate-300 dark:border-slate-700/50'
        )}>
          {customer.language || 'English'}
        </span>
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <a href={`tel:${customer.phone}`} className="flex items-center gap-2.5 text-xs font-semibold hover:text-brand-primary transition-colors">
            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
              <Phone size={11} />
            </span>
            {customer.phone || 'No phone on file'}
          </a>
          {customer.email && (
            <a href={`mailto:${customer.email}`} className="flex items-center gap-2.5 text-xs font-semibold hover:text-brand-primary transition-colors">
              <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
                <Mail size={11} />
              </span>
              {customer.email}
            </a>
          )}
        </div>

        <div className="rounded-lg p-3.5" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>Vehicle</p>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold">{customer.year} {customer.make} {customer.model}</p>
              <p className="text-[10px] font-mono font-semibold text-brand-secondary mt-0.5">VIN •••{customer.vinLast8}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>Odometer</p>
              <p className="text-sm font-bold tabular-nums mt-0.5">{parseInt(customer.mileage || '0').toLocaleString()} mi</p>
            </div>
          </div>
        </div>

        <div className={cn('rounded-lg p-3.5 border flex items-center gap-3', statusCardClass)}>
          <span className={cn('w-2 h-2 rounded-full shrink-0', statusDotClass)} />
          <div>
            <p className={cn('text-[11px] font-black uppercase tracking-wide', statusTitleClass)}>{status.label}</p>
            <p className="text-[10.5px] font-medium mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{status.milestone}</p>
          </div>
        </div>

        {roadmap.length > 0 && (
          <div className="rounded-lg p-3.5" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-tertiary)' }}>Recommended maintenance</p>
            <div className="space-y-1.5">
              {roadmap.map((task, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 text-[11px] font-semibold py-1 border-t first:border-t-0" style={{ borderColor: 'var(--color-surface-border)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      task.importance === 'high' ? 'bg-rose-500' : task.importance === 'medium' ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'
                    )} />
                    <span className="truncate">{task.task}</span>
                  </div>
                  <span className="text-[9px] font-bold uppercase shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>{task.interval}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {timeline.length > 0 && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest mb-2.5" style={{ color: 'var(--color-text-tertiary)' }}>Visit history</p>
            <div className="space-y-0">
              {timeline.map((visit, idx) => (
                <div key={visit.id || idx} className="flex gap-2.5 pb-3 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className={cn('w-2 h-2 rounded-full mt-1 shrink-0', idx === 0 ? 'bg-brand-primary' : 'bg-slate-300 dark:bg-slate-700')} />
                    {idx < timeline.length - 1 && <span className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--color-surface-border)' }} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold truncate">{visit.requests || 'Service visit'}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{visit.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {customer.notes && (
          <div className="rounded-lg p-3.5" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Internal notes</p>
            <p className="text-[11px] font-medium italic" style={{ color: 'var(--color-text-secondary)' }}>"{customer.notes}"</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => onViewLog(customer)} className="btn-primary flex-1 text-[10.5px] py-2.5">
            Log visit
          </button>
          <button type="button" onClick={() => onViewProfile(customer)} className="btn-secondary flex-1 text-[10.5px] py-2.5">
            Full profile
          </button>
        </div>
      </div>
    </div>
  );
}

export const CustomerDirectory: React.FC<CustomerDirectoryProps> = ({
  customers,
  currentUser,
  currentDealershipId,
  onViewProfile,
  onViewLog,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(24);
  const [filterCategory, setFilterCategory] = useState<DirectoryMakeFilter>('All');
  const [sortBy, setSortBy] = useState<'Alerts' | 'Recent' | 'Visits'>('Alerts');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const serviceAlerts = useServiceAlertHelpers();

  const makeFilters = useMemo(
    () => directoryMakeFiltersForDealership(currentDealershipId),
    [currentDealershipId]
  );

  useEffect(() => {
    if (!makeFilters.includes(filterCategory)) {
      setFilterCategory('All');
    }
  }, [makeFilters, filterCategory]);

  // Precompute service status for every customer once per data/config change — reused for
  // sorting, the KPI strip, table badges, and the detail panel.
  const statusById = useMemo(() => {
    const map = new Map<string, ServiceStatus>();
    customers.forEach((c) => {
      const milestoneLabel = serviceAlerts.getNextServiceMilestone(c);
      map.set(c.id, getCustomerServiceStatus(c, serviceAlerts.config, milestoneLabel));
    });
    return map;
  }, [customers, serviceAlerts]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    let result = customers.filter(c => {
      const matchesSearch = !q || (
        c.firstName?.toLowerCase().includes(q) ||
        c.lastName?.toLowerCase().includes(q) ||
        c.vinLast8?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q)
      );

      const matchesCategory = matchesDirectoryMakeFilter(c.make, filterCategory, currentDealershipId);

      return matchesSearch && matchesCategory;
    });

    const getTime = (d: string | undefined | any) => toMillis(d);
    const tierRank: Record<ServiceTier, number> = { overdue: 0, soon: 1, ok: 2 };

    return result.sort((a, b) => {
      if (sortBy === 'Alerts') {
        const rankA = tierRank[statusById.get(a.id)?.tier ?? 'ok'];
        const rankB = tierRank[statusById.get(b.id)?.tier ?? 'ok'];
        if (rankA !== rankB) return rankA - rankB;
        const timeA = getTime(a.lastServiceDate);
        const timeB = getTime(b.lastServiceDate);
        if (timeB !== timeA) return timeB - timeA;
        return a.lastName.localeCompare(b.lastName);
      }

      if (sortBy === 'Recent') {
        const timeA = getTime(a.lastServiceDate);
        const timeB = getTime(b.lastServiceDate);
        if (timeB !== timeA) return timeB - timeA;
        return a.lastName.localeCompare(b.lastName);
      }

      if (sortBy === 'Visits') {
        const countA = a.recentVisits?.length || 0;
        const countB = b.recentVisits?.length || 0;
        if (countB !== countA) return countB - countA;
        const timeA = getTime(a.lastServiceDate);
        const timeB = getTime(b.lastServiceDate);
        if (timeB !== timeA) return timeB - timeA;
        return a.lastName.localeCompare(b.lastName);
      }

      return a.lastName.localeCompare(b.lastName);
    });
  }, [customers, searchQuery, filterCategory, currentDealershipId, sortBy, statusById]);

  const displayCustomers = useMemo(() => {
    return filteredCustomers.slice(0, visibleCount);
  }, [filteredCustomers, visibleCount]);

  // Keep the detail panel pointed at a customer that's actually visible in the current list.
  useEffect(() => {
    if (displayCustomers.length === 0) {
      if (selectedCustomerId !== null) setSelectedCustomerId(null);
      return;
    }
    if (!displayCustomers.some(c => c.id === selectedCustomerId)) {
      setSelectedCustomerId(displayCustomers[0].id);
    }
  }, [displayCustomers, selectedCustomerId]);

  const stats = useMemo(() => {
    let totalROs = 0;
    let totalVisits = 0;
    let activeAlerts = 0;
    let overdue = 0;
    let contactedThisMonth = 0;
    let newThisMonth = 0;

    customers.forEach(c => {
      const visits = c.recentVisits?.length || 0;
      totalROs += visits;
      totalVisits += visits;
      if (serviceAlerts.isServiceAlertActive(c)) activeAlerts += 1;
      if (statusById.get(c.id)?.tier === 'overdue') overdue += 1;
      if (isThisMonth(toMillis(c.lastServiceContact))) contactedThisMonth += 1;
      if (isThisMonth(toMillis(c.createdAt))) newThisMonth += 1;
    });

    const avgVisits = customers.length > 0 ? totalVisits / customers.length : 0;
    const contactedPct = activeAlerts > 0 ? Math.round((contactedThisMonth / activeAlerts) * 100) : 0;

    return { totalROs, activeAlerts, overdue, contactedThisMonth, newThisMonth, avgVisits, contactedPct };
  }, [customers, serviceAlerts, statusById]);

  const selectedCustomer = useMemo(
    () => displayCustomers.find(c => c.id === selectedCustomerId) || null,
    [displayCustomers, selectedCustomerId]
  );

  const sortOptions: { id: 'Alerts' | 'Recent' | 'Visits'; label: string }[] = [
    { id: 'Alerts', label: 'Alerts First' },
    { id: 'Recent', label: 'Recently Visited' },
    { id: 'Visits', label: 'Most Visited' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Customer directory"
        description="Search and open customer profiles, service history, and contact logs."
        breadcrumbs={[{ label: 'Service' }, { label: 'Directory' }]}
        actions={
          <div className="flex gap-2 text-sm">
            <span className="badge badge-info">{customers.length} customers</span>
            <span className="badge badge-info">{stats.totalROs} ROs</span>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total customers"
          value={customers.length.toLocaleString()}
          sub={stats.newThisMonth > 0 ? `↑ ${stats.newThisMonth} this month` : 'No new customers this month'}
          subClassName={stats.newThisMonth > 0 ? 'text-emerald-500 font-semibold' : undefined}
        />
        <KpiCard
          label="Active service alerts"
          value={stats.activeAlerts.toLocaleString()}
          sub={stats.overdue > 0 ? `${stats.overdue} overdue past window` : 'None overdue'}
          subClassName={stats.overdue > 0 ? 'text-amber-500 font-semibold' : undefined}
        />
        <KpiCard
          label="Avg visits / customer"
          value={stats.avgVisits.toFixed(1)}
          sub="Lifetime, all makes"
        />
        <KpiCard
          label="Contacted this month"
          value={stats.contactedThisMonth.toLocaleString()}
          sub={stats.activeAlerts > 0 ? `${stats.contactedPct}% of active alerts` : 'No active alerts'}
          subClassName={stats.contactedThisMonth > 0 ? 'text-emerald-500 font-semibold' : undefined}
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center card-base p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search name, phone, VIN, model..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(24);
            }}
            className="input-field pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg border" style={{ borderColor: 'var(--color-surface-border)' }}>
           <div className="flex flex-wrap items-center gap-1">
             {makeFilters.map(cat => (
               <button
                 key={cat}
                 onClick={() => setFilterCategory(cat)}
                 className={cn(
                   "px-4 py-2.5 rounded-[1rem] text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                   filterCategory === cat
                     ? "bg-brand-primary text-white shadow-xl shadow-brand-primary/20"
                     : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/5"
                 )}
               >
                 {cat}
               </button>
             ))}
           </div>

           <div className="hidden lg:block w-px h-6 bg-slate-200 dark:bg-white/5 mx-1" />
           <div className="lg:hidden w-full h-px bg-slate-200 dark:bg-white/5 my-0.5" />

           <div className="flex flex-wrap items-center gap-1">
             {sortOptions.map(sort => (
               <button
                 key={sort.id}
                 onClick={() => setSortBy(sort.id)}
                 className={cn(
                   "px-4 py-2.5 rounded-[1rem] text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                   sortBy === sort.id
                     ? "bg-brand-secondary text-white shadow-xl shadow-brand-secondary/20"
                     : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/5"
                 )}
               >
                 {sort.label}
               </button>
             ))}
           </div>
        </div>
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {filteredCustomers.length === 0 ? (
          <EmptyState
            title="No customers match your search"
            description="Try a different name, phone number, or VIN. Clear filters to see the full directory."
            action={
              <button type="button" onClick={() => { setSearchQuery(''); setFilterCategory('All'); }} className="btn-secondary">
                Clear filters
              </button>
            }
          />
        ) : (
          <div className="space-y-6">
            {/* Desktop: master-detail table + side panel */}
            <div className="hidden lg:grid lg:grid-cols-[1fr_340px] gap-4 items-start">
              <div className="card-base overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th className="text-right">Visits</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayCustomers.map((c) => {
                        const status = statusById.get(c.id) || { tier: 'ok' as const, label: 'On track', milestone: '' };
                        const selected = c.id === selectedCustomerId;
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedCustomerId(c.id)}
                            className="cursor-pointer"
                            style={selected ? { backgroundColor: 'var(--color-surface-hover)' } : undefined}
                          >
                            <td>
                              <div className="flex items-center gap-2.5">
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                                  style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-primary)' }}
                                >
                                  {customerDisplayInitials(c.firstName, c.lastName)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium flex items-center gap-1.5 truncate">
                                    {formatCustomerDisplayName(c.firstName, c.lastName)}
                                  </p>
                                  <p className="crm-label text-xs">{c.phone || 'No phone'}</p>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="text-sm">{c.year ? `${c.year} ` : ''}{c.make} {c.model}</span>
                              <p className="crm-label text-[10px] font-mono mt-0.5">VIN •••{c.vinLast8}</p>
                            </td>
                            <td className="text-right">
                              <span className="tabular-nums font-semibold">{c.recentVisits?.length || 0}</span>
                            </td>
                            <td>
                              <StatusBadge status={status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="crm-label px-4 py-3 border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
                  Showing {displayCustomers.length} of {filteredCustomers.length} matches
                </p>
              </div>

              {selectedCustomer && (
                <DetailPanel
                  customer={selectedCustomer}
                  status={statusById.get(selectedCustomer.id) || { tier: 'ok', label: 'On track', milestone: '' }}
                  onViewProfile={onViewProfile}
                  onViewLog={onViewLog}
                />
              )}
            </div>

            {/* Mobile / tablet: compact priority list */}
            <div className="lg:hidden space-y-2">
              {displayCustomers.map((c, idx) => {
                const status = statusById.get(c.id) || { tier: 'ok' as const, label: 'On track', milestone: '' };
                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    onClick={() => onViewProfile(c)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.6) }}
                    className="card-base card-interactive w-full flex items-center gap-3 p-3 text-left"
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
                      style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-primary)' }}
                    >
                      {customerDisplayInitials(c.firstName, c.lastName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold flex items-center gap-1.5 truncate">
                        {formatCustomerDisplayName(c.firstName, c.lastName)}
                        <span className={cn(
                          "text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border shrink-0",
                          c.language === 'Spanish' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-slate-100 dark:bg-slate-800/50 text-slate-500 border-slate-300 dark:border-slate-700/50"
                        )}>
                          {c.language === 'Spanish' ? 'ES' : 'EN'}
                        </span>
                      </p>
                      <p className="crm-label text-[10.5px] truncate mt-0.5">
                        {c.year} {c.make} {c.model} · {c.recentVisits?.length || 0} visits
                      </p>
                    </div>
                    <StatusBadge status={status} className="shrink-0" />
                  </motion.button>
                );
              })}
              <p className="crm-label text-center pt-2">
                Showing {displayCustomers.length} of {filteredCustomers.length} matches
              </p>
            </div>

            {filteredCustomers.length > visibleCount && (
              <div className="flex justify-center pt-4 pb-12">
                <button
                  onClick={() => setVisibleCount(prev => prev + 24)}
                  className="group relative px-12 py-5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-2xl hover:border-brand-primary/50 transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-brand-primary/0 via-brand-primary/5 to-brand-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  <span className="relative z-10 flex items-center gap-3 text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">
                    Expand Database <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
