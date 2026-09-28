import React from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { DEALERSHIPS } from '../../constants';
import { cn } from '../../lib/utils';

interface DealershipSwitcherProps {
  value: string;
  onChange: (dealershipId: string) => void;
  className?: string;
  compact?: boolean;
}

/** "Santa Maria Ford/Lincoln" -> "Ford/Lincoln"; "Hyundai of Santa Maria" -> "Hyundai". The city is the same for all three. */
export function shortDealershipName(name: string): string {
  return name.replace(/^Santa Maria\s+/i, '').replace(/\s+of\s+Santa Maria$/i, '').trim() || name;
}

export function DealershipSwitcher({ value, onChange, className, compact }: DealershipSwitcherProps) {
  const current = DEALERSHIPS.find((d) => d.id === value);
  const label = current ? (compact ? shortDealershipName(current.name) : current.name) : 'Select dealership';

  return (
    <label className={cn('block', className)}>
      {!compact && <span className="input-label">Dealership</span>}
      {/*
        A native <select> cannot ellipsize, so at phone width it cut the store
        name off mid-word ("Santa Maria Ford/Lincol"). The visible label is
        drawn here, truncated properly; the real select sits invisibly on top
        so the phone's own picker still opens on tap.
      */}
      <div
        className={cn(
          'relative flex items-center gap-2 rounded-lg border pl-3 pr-2.5 min-h-[44px]',
          'focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/15'
        )}
        style={{ backgroundColor: 'var(--color-surface-card)', borderColor: 'var(--color-surface-border)' }}
      >
        <Building2 size={15} className="shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        <ChevronDown size={15} className="shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Select dealership"
        >
          {DEALERSHIPS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
