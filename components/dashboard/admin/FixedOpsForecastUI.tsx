import React from 'react';
import { cn } from '../../../lib/utils';

export function ForecastPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 dark:border-slate-800/70 bg-white dark:bg-gradient-to-b dark:from-slate-900/70 dark:to-slate-950/90 shadow-xl',
        className
      )}
    >
      {children}
    </div>
  );
}

export function ForecastSectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/8 pb-4 mb-5">
      <div>
        {eyebrow ? (
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary mb-1">
            {eyebrow}
          </p>
        ) : null}
        <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{title}</h3>
      </div>
      {action}
    </div>
  );
}

export function ForecastStat({
  label,
  value,
  sub,
  accent = 'text-slate-900 dark:text-white',
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn('text-2xl sm:text-3xl font-black tabular-nums tracking-tight', accent)}>{value}</p>
      {sub ? <p className="text-xs text-slate-400 font-medium">{sub}</p> : null}
    </div>
  );
}

export function ForecastMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/50 px-4 py-3">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-black text-slate-900 dark:text-white tabular-nums mt-1">{value}</p>
    </div>
  );
}

export function ForecastSlider({
  label,
  valueLabel,
  value,
  min,
  max,
  step = 1,
  onChange,
  accentClass = 'accent-brand-primary',
  valueClassName = 'text-slate-900 dark:text-white',
}: {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  accentClass?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-950/40 px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={cn('text-sm font-black tabular-nums', valueClassName)}>{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={cn('w-full h-1.5 rounded-full appearance-none bg-slate-200 dark:bg-slate-800 cursor-pointer', accentClass)}
      />
    </div>
  );
}

export function ForecastMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent = 'text-slate-900 dark:text-white',
  iconWrapClass = 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300',
  highlight = false,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  detail?: string;
  accent?: string;
  iconWrapClass?: string;
  highlight?: boolean;
}) {
  return (
    <ForecastPanel
      className={cn(
        'p-5 flex items-start gap-4',
        highlight && 'border-rose-500/30 bg-gradient-to-br from-rose-950/20 to-slate-950/90'
      )}
    >
      <div className={cn('p-3 rounded-xl border border-white/5 shrink-0', iconWrapClass)}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
        <p className={cn('text-xl font-black tabular-nums mt-1 leading-none', accent)}>{value}</p>
        {detail ? <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">{detail}</p> : null}
      </div>
    </ForecastPanel>
  );
}

export function ForecastField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const forecastInputClass =
  'w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white text-center font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-primary/40 focus:border-brand-primary/40';

export const forecastReadonlyClass =
  'w-full bg-slate-100 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-brand-primary text-center font-black tabular-nums';
