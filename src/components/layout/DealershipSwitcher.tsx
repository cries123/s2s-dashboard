import React from 'react';
import { Building2 } from 'lucide-react';
import { DEALERSHIPS } from '../../constants';
import { cn } from '../../lib/utils';

interface DealershipSwitcherProps {
  value: string;
  onChange: (dealershipId: string) => void;
  className?: string;
  compact?: boolean;
}

export function DealershipSwitcher({ value, onChange, className, compact }: DealershipSwitcherProps) {
  return (
    <label className={cn('block', className)}>
      {!compact && <span className="input-label">Dealership</span>}
      <div className="relative">
        <Building2
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--color-text-secondary)' }}
        />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn('input-field pl-9 pr-8 py-2 text-sm font-medium w-full', compact && 'py-1.5')}
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
