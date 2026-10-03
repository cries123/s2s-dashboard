import React from 'react';
import { cn } from '../../lib/utils';

export interface KpiTile {
  label: string;
  value: string;
  sublabel?: string;
  subvalue?: string;
  /**
   * Kept for older call sites; no longer tints the tile. Tiles used to be blue, green or
   * amber by position, which left colour meaning nothing. Use valueTone for a number
   * that actually needs attention.
   */
  tone?: 'default' | 'success' | 'warning' | 'info';
  /** Colour the number itself, only when it signals something. */
  valueTone?: 'danger' | 'warning' | 'success';
}

interface KpiStripProps {
  tiles: KpiTile[];
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

const VALUE_TONE: Record<NonNullable<KpiTile['valueTone']>, string> = {
  danger: 'var(--color-badge-error-text)',
  warning: 'var(--color-badge-warn-text)',
  success: 'var(--color-badge-success-text)',
};

/**
 * Summary numbers as one panel split into cells by hairlines, the way corporate
 * dashboards show headline figures, instead of a set of separately tinted boxes.
 */
export function KpiStrip({ tiles, columns = 4, className }: KpiStripProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    // Six divides evenly at every width, so no row ends in a grey hole.
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  }[columns];

  return (
    <div
      className={cn('grid gap-px rounded-md border overflow-hidden', gridCols, className)}
      style={{ backgroundColor: 'var(--color-row-divider)', borderColor: 'var(--color-surface-border)' }}
    >
      {tiles.map((tile) => (
        <div key={tile.label} className="px-4 py-3" style={{ backgroundColor: 'var(--color-surface-card)' }}>
          <p className="crm-label">{tile.label}</p>
          <p className="crm-kpi-value mt-1" style={tile.valueTone ? { color: VALUE_TONE[tile.valueTone] } : undefined}>
            {tile.value}
          </p>
          {(tile.sublabel || tile.subvalue) && (
            <p className="crm-label mt-0.5">
              {tile.sublabel}
              {tile.sublabel && tile.subvalue ? ' · ' : ''}
              {tile.subvalue ? <span className="tabular-nums">{tile.subvalue}</span> : null}
            </p>
          )}
        </div>
      ))}
      {/* Fill the last row so an odd count doesn't leave a grey hole. */}
      {columns === 4 && tiles.length % 2 === 1 ? (
        <div className="lg:hidden" style={{ backgroundColor: 'var(--color-surface-card)' }} />
      ) : null}
    </div>
  );
}
