import React, { useState, useEffect } from 'react';
import { Customer, User, ServiceDriveReason } from '../../../types';
import { useServiceDriveQueue } from '../../../hooks/useServiceDriveQueue';
import { ServiceDriveQueueItem } from './ServiceDriveQueueItem';
import { cn } from '../../../lib/utils';
import { usePreferences } from '../../../context/PreferencesContext';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import { ServiceDriveFilter } from '../../../types';
import {
  LayoutDashboard,
  Bell,
  Clock,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface ServiceDriveCockpitProps {
  customers: Customer[];
  currentUser: User;
  currentDealershipId: string;
  dealershipName: string;
  onViewProfile: (customer: Customer) => void;
  onRefresh?: (msg: string, isError?: boolean) => void;
}

type FilterId = ServiceDriveFilter;

const FILTERS: { id: FilterId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'all', label: 'All', icon: LayoutDashboard },
  { id: 'service_due', label: 'Service Due', icon: Bell },
  { id: 'stale_followup', label: 'Follow Up', icon: Clock },
];

export function ServiceDriveCockpit({
  customers,
  currentUser,
  currentDealershipId,
  dealershipName,
  onViewProfile,
  onRefresh,
}: ServiceDriveCockpitProps) {
  const { preferences } = usePreferences();
  const serviceAlerts = useServiceAlertHelpers();
  const [filter, setFilter] = useState<FilterId>(preferences.serviceDrive.defaultFilter);

  useEffect(() => {
    setFilter(preferences.serviceDrive.defaultFilter);
  }, [preferences.serviceDrive.defaultFilter]);

  const { queue, stats, filterQueue } = useServiceDriveQueue(customers, currentDealershipId, {
    followUpDays: preferences.contactWorkflow.followUpDays,
    queuePriority: preferences.serviceDrive.queuePriority,
    serviceAlertConfig: serviceAlerts.config,
  });

  const visibleQueue = filterQueue(filter);

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-brand-primary/10 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 blur-[80px] rounded-full pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-brand-primary/20 flex items-center justify-center">
                <Sparkles size={16} className="text-brand-primary" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-brand-primary">
                Service Drive
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase italic">
              Today&apos;s Work Queue
            </h1>
            <p className="text-sm font-medium text-slate-400 mt-1">{todayLabel}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-2">
              {dealershipName}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto lg:min-w-[340px]">
            <StatChip label="In Queue" value={stats.queueTotal} accent="text-white" />
            <StatChip label="Service Due" value={stats.serviceDue} accent="text-amber-400" />
            <StatChip label="Follow Up" value={stats.staleFollowUp} accent="text-violet-400" />
            <StatChip
              label="Appts Today"
              value={stats.todayAppointments}
              accent="text-emerald-400"
              icon={Calendar}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ id, label, icon: Icon }) => {
          const count =
            id === 'all'
              ? stats.queueTotal
              : id === 'service_due'
                ? stats.serviceDue
                : stats.staleFollowUp;

          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all',
                filter === id
                  ? 'bg-brand-primary/20 text-brand-primary border-brand-primary/40'
                  : 'bg-slate-900/50 text-slate-400 border-white/5 hover:border-white/15'
              )}
            >
              <Icon size={12} />
              {label}
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-md text-[8px]',
                  filter === id ? 'bg-brand-primary/30' : 'bg-slate-800'
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {visibleQueue.length === 0 ? (
          <div className="card-base p-12 text-center border-dashed border-slate-700">
            <LayoutDashboard size={40} className="mx-auto text-slate-600 mb-4" />
            <p className="text-lg font-black text-white uppercase italic">Queue clear</p>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
              {filter === 'all'
                ? 'No service-due customers right now — active alerts from your CRM will appear here automatically.'
                : 'No customers match this filter. Try All or check the Alerts tab.'}
            </p>
          </div>
        ) : (
          visibleQueue.map((item, index) => (
            <div key={item.customer.id}>
              <ServiceDriveQueueItem
                item={item}
                rank={index + 1}
                currentUser={currentUser}
                onViewProfile={onViewProfile}
                onRefresh={onRefresh}
              />
            </div>
          ))
        )}
      </div>

      <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center pb-4">
        Ranked by service due · follow-up urgency
      </p>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number;
  accent: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="rounded-2xl bg-slate-950/60 border border-white/5 px-3 py-3 text-center backdrop-blur-sm">
      <div className={cn('text-xl sm:text-2xl font-black tabular-nums', accent)}>
        {Icon ? (
          <span className="inline-flex items-center justify-center gap-1">
            <Icon size={16} className="opacity-70" />
            {value}
          </span>
        ) : (
          value
        )}
      </div>
      <div className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-1">{label}</div>
    </div>
  );
}
