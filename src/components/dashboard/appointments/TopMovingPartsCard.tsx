import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Package } from 'lucide-react';
import type { Customer } from '../../../types';
import { computeTopMovingParts, movingPartsWindowForMonth } from '../../../lib/topMovingParts';
import { formatPeriodRange } from '../../../lib/reportPeriodLabel';
import { EmptyState } from '../../ui/EmptyState';
import { cn } from '../../../lib/utils';

interface TopMovingPartsCardProps {
  customers: Customer[];
  /** 'active' or a YYYY-MM archive key — matches the Operations view period. */
  selectedMonth: string;
  /** How many rows to rank. The list scrolls, so this can be generous. */
  limit?: number;
  /** Open on first render. Collapsed by default so it stays out of the way. */
  defaultOpen?: boolean;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function TopMovingPartsCard({
  customers,
  selectedMonth,
  limit = 50,
  defaultOpen = false,
}: TopMovingPartsCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const window = useMemo(() => movingPartsWindowForMonth(selectedMonth), [selectedMonth]);
  const parts = useMemo(() => computeTopMovingParts(customers, window, limit), [customers, window, limit]);
  const totalUnits = parts.reduce((s, p) => s + p.quantity, 0);

  return (
    <section className="card-base overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        <span className="min-w-0">
          <span className="crm-section-title flex items-center gap-2">
            <Package size={16} className="text-brand-primary" />
            Top moving parts
          </span>
          <span className="crm-label tabular-nums block mt-0.5 truncate">
            {formatPeriodRange(window.start, window.end)} · {parts.length} parts ·{' '}
            {totalUnits.toLocaleString()} units
          </span>
        </span>
        {open ? <ChevronUp size={16} className="shrink-0" /> : <ChevronDown size={16} className="shrink-0" />}
      </button>

      {open && (
        <div className="border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
          {parts.length === 0 ? (
            <EmptyState
              title="No parts data for this period"
              description="Parts appear here once repair orders with part lines have synced from PBS for the selected month."
              className="py-8 border-0"
            />
          ) : (
            // Scrolls so the long tail is reachable without the card taking over the page.
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
              <table className="crm-table">
                <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--color-surface-card)' }}>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Part</th>
                    <th className="text-right">Units</th>
                    <th className="text-right hidden sm:table-cell">ROs</th>
                    <th className="text-right hidden md:table-cell">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p, i) => (
                    <tr key={p.partNumber}>
                      <td className={cn('tabular-nums')} style={{ color: 'var(--color-text-tertiary)' }}>{i + 1}</td>
                      <td>
                        <div className="font-mono text-sm">{p.partNumber}</div>
                        {p.description && <div className="crm-label truncate max-w-[32ch]">{p.description}</div>}
                      </td>
                      <td className="text-right font-semibold tabular-nums">{p.quantity.toLocaleString()}</td>
                      <td className="text-right tabular-nums hidden sm:table-cell">{p.repairOrders.toLocaleString()}</td>
                      <td className="text-right tabular-nums hidden md:table-cell">{p.revenue > 0 ? money(p.revenue) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default TopMovingPartsCard;
