/**
 * Sales-to-service conversion — the question the product is named after.
 *
 * Of the customers who bought a vehicle here, how many came back for service,
 * how long did they take, and what did they spend once they did.
 *
 * Two rules keep the number honest:
 *
 *   - Only visits on or after the sold date count. A repair order that predates
 *     the sale belongs to the previous owner, or to a different vehicle.
 *   - Revenue is reported alongside how many visits actually carried price data.
 *     Most of the imported history has no labour or parts lines at all, so a
 *     revenue total on its own would read as far lower than reality. The
 *     coverage figure is what tells you whether to trust it.
 */

export interface SalesToServiceVisit {
  date?: string;
  lines?: Array<{
    labourLines?: Array<{ price?: number }> | null;
    partLines?: Array<{ price?: number }> | null;
  }> | null;
}

export interface SalesToServiceCustomer {
  id: string;
  firstName?: string;
  lastName?: string;
  soldDate?: string;
  /** Who onboarded them, for a per-salesperson breakdown. */
  addedByUsername?: string;
  recentVisits?: SalesToServiceVisit[] | null;
}

export interface SoldCustomerOutcome {
  id: string;
  name: string;
  soldDate: string;
  salesperson: string;
  firstVisitDate: string | null;
  daysToFirstVisit: number | null;
  visits: number;
  revenue: number;
  /** How many of this customer's counted visits carried any price data. */
  visitsWithRevenueData: number;
}

export interface ConversionBucket {
  key: string;
  sold: number;
  converted: number;
  conversionRate: number | null;
  revenue: number;
}

export interface SalesToServiceResult {
  sold: number;
  converted: number;
  conversionRate: number | null;
  medianDaysToFirstVisit: number | null;
  revenue: number;
  /** Revenue divided across every sold customer, converted or not. */
  revenuePerSoldCustomer: number;
  /** 0–100: share of counted visits that carried any price data. */
  revenueDataCoverage: number | null;
  byMonthSold: ConversionBucket[];
  bySalesperson: ConversionBucket[];
  rows: SoldCustomerOutcome[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDay(value: unknown): string | null {
  const s = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function daysBetween(fromDay: string, toDayStr: string): number {
  const a = new Date(`${fromDay}T00:00:00`).getTime();
  const b = new Date(`${toDayStr}T00:00:00`).getTime();
  return Math.round((b - a) / DAY_MS);
}

function visitRevenue(visit: SalesToServiceVisit): { total: number; hasData: boolean } {
  let total = 0;
  let hasData = false;
  for (const line of visit.lines ?? []) {
    for (const l of line?.labourLines ?? []) {
      if (typeof l?.price === 'number' && Number.isFinite(l.price)) {
        total += l.price;
        hasData = true;
      }
    }
    for (const p of line?.partLines ?? []) {
      if (typeof p?.price === 'number' && Number.isFinite(p.price)) {
        total += p.price;
        hasData = true;
      }
    }
  }
  return { total, hasData };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function bucketsFrom(
  m: Map<string, { sold: number; converted: number; revenue: number }>
): ConversionBucket[] {
  return [...m.entries()].map(([key, v]) => ({
    key,
    sold: v.sold,
    converted: v.converted,
    conversionRate: v.sold > 0 ? Math.round((v.converted / v.sold) * 100) : null,
    revenue: Math.round(v.revenue),
  }));
}

export interface SalesToServiceOptions<C = SalesToServiceCustomer> {
  /** Only count customers sold on or after this day (YYYY-MM-DD). */
  soldFrom?: string;
  /** Only count customers sold on or before this day (YYYY-MM-DD). */
  soldTo?: string;
  /**
   * Only count a return visit if it happened within this many days of the sale.
   * Without it, a customer sold three years ago is compared against one sold
   * last week, which flatters the older cohort.
   */
  withinDays?: number;
  /** Excluded from the count — dealership-owned records are not customers. */
  isExcluded?: (customer: C) => boolean;
}

export function computeSalesToService<C extends SalesToServiceCustomer>(
  customers: C[],
  options: SalesToServiceOptions<C> = {}
): SalesToServiceResult {
  const { soldFrom, soldTo, withinDays, isExcluded } = options;

  const rows: SoldCustomerOutcome[] = [];
  const byMonth = new Map<string, { sold: number; converted: number; revenue: number }>();
  const bySales = new Map<string, { sold: number; converted: number; revenue: number }>();

  let countedVisits = 0;
  let visitsWithRevenue = 0;

  for (const c of customers ?? []) {
    if (isExcluded?.(c)) continue;
    const soldDate = toDay(c.soldDate);
    if (!soldDate) continue;
    if (soldFrom && soldDate < soldFrom) continue;
    if (soldTo && soldDate > soldTo) continue;

    const salesperson = c.addedByUsername?.trim() || 'Unknown';
    let visits = 0;
    let revenue = 0;
    let withData = 0;
    let firstVisitDate: string | null = null;

    for (const v of c.recentVisits ?? []) {
      const day = toDay(v?.date);
      if (!day || day < soldDate) continue;
      if (withinDays !== undefined && daysBetween(soldDate, day) > withinDays) continue;

      visits += 1;
      const { total, hasData } = visitRevenue(v);
      revenue += total;
      if (hasData) withData += 1;
      if (!firstVisitDate || day < firstVisitDate) firstVisitDate = day;
    }

    countedVisits += visits;
    visitsWithRevenue += withData;

    rows.push({
      id: c.id,
      name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
      soldDate,
      salesperson,
      firstVisitDate,
      daysToFirstVisit: firstVisitDate ? daysBetween(soldDate, firstVisitDate) : null,
      visits,
      revenue,
      visitsWithRevenueData: withData,
    });

    const monthKey = soldDate.slice(0, 7);
    for (const [map, key] of [
      [byMonth, monthKey],
      [bySales, salesperson],
    ] as const) {
      const cur = map.get(key) ?? { sold: 0, converted: 0, revenue: 0 };
      cur.sold += 1;
      if (visits > 0) cur.converted += 1;
      cur.revenue += revenue;
      map.set(key, cur);
    }
  }

  const sold = rows.length;
  const convertedRows = rows.filter((r) => r.visits > 0);
  const revenue = rows.reduce((n, r) => n + r.revenue, 0);

  return {
    sold,
    converted: convertedRows.length,
    conversionRate: sold > 0 ? Math.round((convertedRows.length / sold) * 100) : null,
    medianDaysToFirstVisit: median(
      convertedRows.map((r) => r.daysToFirstVisit).filter((n): n is number => n !== null)
    ),
    revenue: Math.round(revenue),
    revenuePerSoldCustomer: sold > 0 ? Math.round(revenue / sold) : 0,
    revenueDataCoverage:
      countedVisits > 0 ? Math.round((visitsWithRevenue / countedVisits) * 100) : null,
    byMonthSold: bucketsFrom(byMonth).sort((a, b) => a.key.localeCompare(b.key)),
    bySalesperson: bucketsFrom(bySales).sort((a, b) => b.sold - a.sold),
    rows,
  };
}
