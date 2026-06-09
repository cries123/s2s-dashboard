import React from 'react';
import { cn } from '../../lib/utils';

export interface KpiTile {
  label: string;
  value: string;
  sublabel?: string;
  subvalue?: string;
  tone?: 'default' | 'success' | 'warning' | 'info';
}

interface KpiStripProps {
  tiles: KpiTile[];
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}

const toneClasses: Record<NonNullable<KpiTile['tone']>, string> = {
  default: '',
  success: 'border-emerald-500/20 bg-emerald-500/5',
  warning: 'border-amber-500/20 bg-amber-500/5',
  info: 'border-brand-primary/20 bg-brand-primary/5',
};

export function KpiStrip({ tiles, columns = 4, className }: KpiStripProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  }[columns];

  return (
    <div className={cn('grid gap-3', gridCols, className)}>
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={cn('card-base px-4 py-3', tile.tone && tile.tone !== 'default' && toneClasses[tile.tone])}
        >
          <p className="crm-label">{tile.label}</p>
          <p className="crm-kpi-value mt-1">{tile.value}</p>
          {(tile.sublabel || tile.subvalue) && (
            <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
              {tile.sublabel && <span className="crm-label text-[10px]">{tile.sublabel}</span>}
              {tile.subvalue && <span className="text-xs font-medium tabular-nums">{tile.subvalue}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
