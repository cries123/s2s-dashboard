import type { Customer } from '../types';

/**
 * Top moving parts, computed from the service history already synced onto each
 * customer (recentVisits[].lines[].partLines[]). No extra PBS call.
 */

export interface MovingPart {
  partNumber: string;
  description: string;
  /** Units shipped across all matching visits. */
  quantity: number;
  /** Distinct repair orders the part appeared on. */
  repairOrders: number;
  /** Sum of line revenue when the sync carried a price. */
  revenue: number;
}

export interface MovingPartsWindow {
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  /** Inclusive, YYYY-MM-DD. */
  end: string;
}

function normalizePartNumber(raw: string | undefined | null): string {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function computeTopMovingParts(
  customers: Customer[],
  window: MovingPartsWindow,
  limit = 10
): MovingPart[] {
  const byPart = new Map<string, MovingPart & { ros: Set<string> }>();

  for (const customer of customers) {
    for (const visit of customer.recentVisits || []) {
      const date = String(visit.date || '').slice(0, 10);
      if (!date || date < window.start || date > window.end) continue;
      const roKey = String(visit.soNumber || visit.id || `${customer.id}:${date}`);

      for (const line of visit.lines || []) {
        for (const part of line.partLines || []) {
          const partNumber = normalizePartNumber(part.partNumber);
          if (!partNumber) continue;
          const qty = Number(part.qty);
          const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
          const price = Number(part.price);
          const revenue = Number.isFinite(price) ? price : 0;

          let entry = byPart.get(partNumber);
          if (!entry) {
            entry = {
              partNumber,
              description: String(part.description || '').trim(),
              quantity: 0,
              repairOrders: 0,
              revenue: 0,
              ros: new Set(),
            };
            byPart.set(partNumber, entry);
          }
          entry.quantity += quantity;
          entry.revenue += revenue;
          entry.ros.add(roKey);
          if (!entry.description && part.description) entry.description = String(part.description).trim();
        }
      }
    }
  }

  return [...byPart.values()]
    .map(({ ros, ...rest }) => ({ ...rest, repairOrders: ros.size }))
    .sort((a, b) => b.quantity - a.quantity || b.repairOrders - a.repairOrders || a.partNumber.localeCompare(b.partNumber))
    .slice(0, limit);
}

/** Calendar-month window for a view-period key ('active' = current month). */
export function movingPartsWindowForMonth(selectedMonth: string, now = new Date()): MovingPartsWindow {
  let year = now.getFullYear();
  let month = now.getMonth();
  if (selectedMonth !== 'active') {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      year = y;
      month = m - 1;
    }
  }
  const mm = String(month + 1).padStart(2, '0');
  const last = new Date(year, month + 1, 0).getDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}
