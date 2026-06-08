import React from 'react';
import { Activity, CheckCircle2, Clock, Inbox, Moon } from 'lucide-react';
import { DISPATCH_PRODUCTION_LANES } from '../../../lib/dispatchConfig';
import {
  computeDispatchMetrics,
  formatWaitMinutes,
  type DispatchMetrics,
} from '../../../lib/dispatchMetrics';
import { DISPATCH_STATUS_COLORS } from '../../../lib/dispatchConfig';
import type { DispatchRepairOrder } from '../../../types';
import { cn } from '../../../lib/utils';

interface DispatchMetricsBarProps {
  orders: DispatchRepairOrder[];
  currentSystemDate: string;
  isOvernight: (ro: DispatchRepairOrder) => boolean;
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
  compact = false,
}: DispatchMetricsBarProps) {
  const metrics = useDispatchMetrics({ orders, currentSystemDate, isOvernight });

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-wider">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
          <span className="text-slate-500 block">Queue</span>
          <span className="text-white tabular-nums text-sm">{metrics.queueCount}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
          <span className="text-slate-500 block">Done today</span>
          <span className="text-emerald-400 tabular-nums text-sm">{metrics.completedToday}</span>
        </div>
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

function MetricTile({
  icon: Icon,
  label,
  value,
  accent = 'text-white',
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-slate-500 mb-1">
        <Icon size={11} />
        <span className="text-[8px] font-black uppercase tracking-wider truncate">{label}</span>
      </div>
      <span className={cn('text-lg font-black tabular-nums leading-none', accent)}>{value}</span>
    </div>
  );
}
