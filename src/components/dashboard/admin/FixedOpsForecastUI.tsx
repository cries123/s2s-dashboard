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
        'card-base',
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 mb-5">
      {/* eyebrow is accepted for older call sites but no longer drawn: a second,
          brand-coloured title above every title was the loudest thing on the page. */}
      <h3 className="crm-section-title">{title}</h3>
      {action ? <div className="self-start sm:self-auto shrink-0">{action}</div> : null}
    </div>
  );
}

export function ForecastStat({
  label,
  value,
  sub,
  accent = 'text-white',
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="crm-label">{label}</p>
      <p className="text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
      {sub ? <p className="crm-label">{sub}</p> : null}
    </div>
  );
}

export function ForecastMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
      <p className="crm-label">{label}</p>
      <p className="text-sm font-semibold tabular-nums mt-1">{value}</p>
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
  valueClassName = 'text-white',
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
    <div className="rounded-lg border px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="crm-label">{label}</span>
        <span className={cn('text-sm font-semibold tabular-nums', valueClassName)}>{valueLabel}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={valueLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={cn('range-touch w-full cursor-pointer', accentClass)}
      />
    </div>
  );
}

export function ForecastMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent = 'text-white',
  iconWrapClass = 'bg-slate-800/80 text-slate-300',
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
      <div className="p-2.5 rounded-lg border shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="crm-label">{label}</p>
        <p className="text-xl font-semibold tabular-nums mt-1 leading-none" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
        {detail ? <p className="crm-label mt-1.5 leading-snug">{detail}</p> : null}
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
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const forecastInputClass = 'input-field text-center font-semibold tabular-nums';

export const forecastReadonlyClass =
  'input-field text-center font-semibold tabular-nums bg-surface-muted';
