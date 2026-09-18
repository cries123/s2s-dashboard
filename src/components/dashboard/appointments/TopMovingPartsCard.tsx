import React, { useMemo } from 'react';
import { Package } from 'lucide-react';
import type { Customer } from '../../../types';
import { computeTopMovingParts, movingPartsWindowForMonth } from '../../../lib/topMovingParts';
import { EmptyState } from '../../ui/EmptyState';

interface TopMovingPartsCardProps {
  customers: Customer[];
  /** 'active' or a YYYY-MM archive key — matches the Operations view period. */
  selectedMonth: string;
  limit?: number;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function TopMovingPartsCard({ customers, selectedMonth, limit = 10 }: TopMovingPartsCardProps) {
  const window = useMemo(() => movingPartsWindowForMonth(selectedMonth), [selectedMonth]);
  const parts = useMemo(() => computeTopMovingParts(customers, window, limit), [customers, window, limit]);
  const totalUnits = parts.reduce((s, p) => s + p.quantity, 0);

  return (
    <section className="card-base p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="crm-section-title flex items-center gap-2">
          <Package size={16} className="text-brand-primary" />
          Top moving parts
        </h2>
        <span className="crm-label tabular-nums">
          {window.start.slice(0, 7)} · {totalUnits.toLocaleString()} units
        </span>
      </div>

      {parts.length === 0 ? (
        <EmptyState
          title="No parts data for this period"
          description="Parts appear here once repair orders with part lines have synced from PBS for the selected month."
          className="py-8"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="crm-table">
            <thead>
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
                  <td className="tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>{i + 1}</td>
                  <td>
                    <div className="font-mono text-sm">{p.partNumber}</div>
                    {p.description && <div className="crm-label truncate max-w-[28ch]">{p.description}</div>}
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
    </section>
  );
}

export default TopMovingPartsCard;
