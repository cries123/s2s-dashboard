import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Inbox, Moon, Wrench } from 'lucide-react';
import { DISPATCH_PRODUCTION_LANES } from '../../../lib/dispatchConfig';
import {
  computeDispatchMetrics,
  formatWaitMinutes,
  type DispatchMetrics,
} from '../../../lib/dispatchMetrics';
import { DISPATCH_STATUS_COLORS } from '../../../lib/dispatchConfig';
import type { DispatchRepairOrder, PerformanceAdvisorSlot } from '../../../types';
import { buildTechWorkloadSummary } from '../../../lib/dispatchTechRoster';
import { cn } from '../../../lib/utils';

interface DispatchMetricsBarProps {
  orders: DispatchRepairOrder[];
  currentSystemDate: string;
  isOvernight: (ro: DispatchRepairOrder) => boolean;
  dispatchTechRoster?: PerformanceAdvisorSlot[];
  techRoCounts?: Map<string, number>;
  overdueCount?: number;
  compact?: boolean;
}

export function useDispatchMetrics(props: DispatchMetricsBarProps): DispatchMetrics {
  return React.useMemo(
    () => computeDispatchMetrics(props.orders, props.currentSystemDate, props.isOvernight),
    [props.orders, props.currentSystemDate, props.isOvernight]
  );
}

export function DispatchMetricsBar({
  orders,
  currentSystemDate,
  isOvernight,
  dispatchTechRoster = [],
  techRoCounts,
  overdueCount = 0,
  compact = false,
}: DispatchMetricsBarProps) {
  const metrics = useDispatchMetrics({ orders, currentSystemDate, isOvernight });
  const techWorkload = React.useMemo(
    () =>
      dispatchTechRoster.length && techRoCounts
        ? buildTechWorkloadSummary(dispatchTechRoster, techRoCounts)
        : [],
    [dispatchTechRoster, techRoCounts]
  );

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-wider">
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
            <span className="text-slate-500 block">Queue</span>
            <span className="text-white tabular-nums text-sm">{metrics.queueCount}</span>
          </div>
          <div
            className={cn(
              'rounded-xl border px-3 py-2',
              overdueCount > 0
                ? 'border-rose-500/50 bg-rose-950/50 animate-pulse'
                : 'border-slate-800 bg-slate-950/80'
            )}
          >
            <span className={overdueCount > 0 ? 'text-rose-300 block' : 'text-slate-500 block'}>
              Overdue
            </span>
            <span
              className={cn(
                'tabular-nums text-sm',
                overdueCount > 0 ? 'text-rose-200' : 'text-slate-500'
              )}
            >
              {overdueCount}
            </span>
          </div>
        </div>
        {techWorkload.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {techWorkload
              .filter((row) => row.count > 0)
              .slice(0, 8)
              .map((row) => (
                <TechWorkloadChip key={row.techId} lastName={row.lastName} count={row.count} />
              ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-indigo-400" />
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
          Shop Metrics
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {overdueCount > 0 ? (
          <MetricTile
            icon={AlertTriangle}
            label="Past promise"
            value={String(overdueCount)}
            accent="text-rose-400"
            highlight
          />
        ) : null}
        <MetricTile icon={Inbox} label="In queue" value={String(metrics.queueCount)} />
        <MetricTile
          icon={Clock}
          label="Avg queue wait"
          value={formatWaitMinutes(metrics.avgQueueWaitMinutes)}
        />
        <MetricTile icon={Activity} label="Active ROs" value={String(metrics.activeCount)} />
        <MetricTile icon={Moon} label="Overnight" value={String(metrics.overnightCount)} />
        <MetricTile
          icon={CheckCircle2}
          label="Completed today"
          value={String(metrics.completedToday)}
          accent="text-emerald-400"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(DISPATCH_STATUS_COLORS).map(([code, info]) => (
          <span
            key={code}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950/80 text-[9px] font-black uppercase tracking-wider text-slate-400"
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: info.hex }} />
            {code}
            <span className="text-white tabular-nums">{metrics.statusCounts[code as keyof typeof metrics.statusCounts]}</span>
          </span>
        ))}
      </div>

      {techWorkload.length > 0 && (
        <div className="pt-2 border-t border-slate-800/60">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
            <Wrench size={10} className="text-indigo-400" />
            Tech workload
          </p>
          <div className="flex flex-wrap gap-2">
            {techWorkload.map((row) => (
              <TechWorkloadChip key={row.techId} lastName={row.lastName} count={row.count} />
            ))}
          </div>
        </div>
      )}

      {Object.keys(metrics.avgLaneWaitMinutes).length > 0 && (
        <div className="pt-2 border-t border-slate-800/60">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
            Avg time in lane
          </p>
          <div className="flex flex-wrap gap-2">
            {DISPATCH_PRODUCTION_LANES.filter((lane) => metrics.avgLaneWaitMinutes[lane.id] != null).map(
              (lane) => (
                <span
                  key={lane.id}
                  className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400"
                >
                  {lane.label.split(' ')[0]}{' '}
                  <span className="text-indigo-300 tabular-nums">
                    {formatWaitMinutes(metrics.avgLaneWaitMinutes[lane.id] ?? 0)}
                  </span>
                </span>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TechWorkloadChip({ lastName, count }: { lastName: string; count: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider',
        count > 0
          ? 'border-indigo-500/30 bg-indigo-950/40 text-slate-200'
          : 'border-slate-800 bg-slate-950/80 text-slate-500'
      )}
    >
      <span>{lastName}</span>
      <span className={cn('tabular-nums', count > 0 ? 'text-indigo-300' : 'text-slate-600')}>
        {count}
      </span>
    </span>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  accent = 'text-white',
  highlight = false,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  accent?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5 min-w-0',
        highlight
          ? 'border-rose-500/50 bg-rose-950/40 animate-pulse'
          : 'border-slate-800 bg-slate-950/70'
      )}
    >
      <div className="flex items-center gap-1.5 text-slate-500 mb-1">
        <Icon size={11} />
        <span className="text-[8px] font-black uppercase tracking-wider truncate">{label}</span>
      </div>
      <span className={cn('text-lg font-black tabular-nums leading-none', accent)}>{value}</span>
    </div>
  );
}
