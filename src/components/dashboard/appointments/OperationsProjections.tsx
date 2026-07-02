import React, { useState } from 'react';
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { forecastGoalPercent } from '../../../lib/appointmentForecast';
import type { AppointmentForecastMetrics } from '../../../lib/appointmentForecast';

interface ProjectionRow {
  label: string;
  current: number;
  daily: number;
  forecast: number;
  target: number;
  isCurrency: boolean;
}

interface OperationsProjectionsProps {
  metrics: AppointmentForecastMetrics;
  hasForecastData: boolean;
}

export function OperationsProjections({ metrics, hasForecastData }: OperationsProjectionsProps) {
  const [expanded, setExpanded] = useState(hasForecastData);

  const rows: ProjectionRow[] = [
    {
      label: 'Labor gross',
      current: metrics.mtdGross,
      daily: metrics.laborDailyAvg,
      forecast: metrics.grossForecast,
      target: metrics.laborTarget,
      isCurrency: true,
    },
    {
      label: 'Parts gross',
      current: metrics.mtdPartsGross,
      daily: metrics.partsDailyAvg,
      forecast: metrics.partsForecast,
      target: metrics.partsTarget,
      isCurrency: true,
    },
    {
      label: 'Appointment volume',
      current: metrics.monthTotal,
      daily: Number(metrics.avgDaily),
      forecast: metrics.forecast,
      target: metrics.monthTarget,
      isCurrency: false,
    },
  ];

  return (
    <div className="card-base overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-brand-primary" />
          <div>
            <h2 className="crm-section-title">Month-end projections</h2>
            <p className="text-xs text-slate-400">
              {hasForecastData
                ? `${metrics.daysRemaining} working days left this month`
                : 'Log scheduled volume to unlock forecasts'}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t px-5 pb-5 pt-4 space-y-3" style={{ borderColor: 'var(--color-surface-border)' }}>
          {!hasForecastData ? (
            <div
              className="rounded-xl border border-dashed p-8 text-center"
              style={{ borderColor: 'var(--color-surface-border)' }}
            >
              <p className="font-medium text-white mb-1">No projections yet</p>
              <p className="text-sm text-slate-400">
                Save at least one day of scheduled volume above to see month-end pace and goals.
              </p>
            </div>
          ) : (
            rows.map((kpi) => {
              const completionPercent = forecastGoalPercent(kpi.forecast, kpi.target);
              const isShortfall = kpi.forecast < kpi.target;
              return (
                <div
                  key={kpi.label}
                  className="rounded-xl border p-4"
                  style={{ borderColor: 'var(--color-surface-border)' }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="crm-label">{kpi.label}</span>
                        <span className={cn('badge', isShortfall ? 'badge-error' : 'badge-success')}>
                          {isShortfall ? 'Shortfall' : 'On track'}
                        </span>
                      </div>
                      <p className="crm-kpi-value">
                        {kpi.isCurrency
                          ? `$${Math.round(kpi.forecast).toLocaleString()}`
                          : Math.round(kpi.forecast).toLocaleString()}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="crm-label">MTD</p>
                        <p className="font-medium tabular-nums">
                          {kpi.isCurrency ? `$${Math.round(kpi.current).toLocaleString()}` : Math.round(kpi.current)}
                        </p>
                      </div>
                      <div>
                        <p className="crm-label">Pace/day</p>
                        <p className="font-medium tabular-nums">
                          {kpi.isCurrency ? `$${Math.round(kpi.daily).toLocaleString()}` : kpi.daily.toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p className="crm-label">Goal</p>
                        <p className="font-medium tabular-nums">
                          {kpi.isCurrency ? `$${Math.round(kpi.target).toLocaleString()}` : Math.round(kpi.target)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
                    <div
                      className="h-full bg-brand-primary rounded-full transition-all"
                      style={{ width: `${Math.min(100, completionPercent)}%` }}
                    />
                  </div>
                  <p className="crm-label mt-1.5 text-right">{completionPercent}% of monthly goal</p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
