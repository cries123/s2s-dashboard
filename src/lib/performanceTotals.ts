export interface PerformanceAdvisorRow {
  grossLabor?: number;
  laborGross?: number;
  laborSold?: number;
  grossParts?: number;
  partsSold?: number;
  hrsSold?: number;
}

export interface PerformanceTotalsDoc {
  totalGross?: number;
  totalLabor?: number;
  totalParts?: number;
  totalGrossParts?: number;
  totalPartsGross?: number;
  totalSales?: number;
  totalHrs?: number;
}

export interface ResolvedPerformanceTotals {
  totalGross: number;
  totalLabor: number;
  totalParts: number;
  totalGrossParts: number;
  totalSales: number;
  totalHrs: number;
  reportStartDate?: string;
  reportEndDate?: string;
}

/** Reconcile store totals vs advisor sums — same rules as Advisor Performance tab. */
export function resolvePerformanceTotalsFromDoc(
  data:
    | {
        advisors?: PerformanceAdvisorRow[];
        totals?: PerformanceTotalsDoc;
        reportStartDate?: string;
        reportEndDate?: string;
      }
    | null
    | undefined
): ResolvedPerformanceTotals | null {
  if (!data) return null;

  const advisors = data.advisors ?? [];
  let baseTotals: PerformanceTotalsDoc | null = data.totals ? { ...data.totals } : null;

  if (advisors.length > 0) {
    const computedGross = advisors.reduce(
      (acc, row) => acc + (Number(row.grossLabor) || Number(row.laborGross) || 0),
      0
    );
    const computedLabor = advisors.reduce((acc, row) => acc + (Number(row.laborSold) || 0), 0);
    const computedParts = advisors.reduce((acc, row) => acc + (Number(row.partsSold) || 0), 0);
    const computedGrossParts = advisors.reduce((acc, row) => acc + (Number(row.grossParts) || 0), 0);
    const computedSales = computedLabor + computedParts;
    const computedHrs = advisors.reduce((acc, row) => acc + (Number(row.hrsSold) || 0), 0);

    const storedGross = Number(baseTotals?.totalGross) || 0;
    const storedLabor = Number(baseTotals?.totalLabor) || 0;

    if (
      !baseTotals ||
      Math.abs(storedGross - computedGross) > 10 ||
      Math.abs(storedLabor - computedLabor) > 10 ||
      computedGross > storedGross
    ) {
      baseTotals = {
        totalGross: computedGross,
        totalLabor: computedLabor,
        totalParts: computedParts,
        totalGrossParts: computedGrossParts,
        totalSales: computedSales,
        totalHrs: computedHrs,
      };
    } else {
      baseTotals.totalSales =
        (Number(baseTotals.totalLabor) || 0) + (Number(baseTotals.totalParts) || 0);
    }
  }

  if (!baseTotals) return null;

  const totalGrossParts =
    Number(baseTotals.totalGrossParts ?? baseTotals.totalPartsGross) || 0;

  return {
    totalGross: Number(baseTotals.totalGross) || 0,
    totalLabor: Number(baseTotals.totalLabor) || 0,
    totalParts: Number(baseTotals.totalParts) || 0,
    totalGrossParts,
    totalSales: Number(baseTotals.totalSales) || 0,
    totalHrs: Number(baseTotals.totalHrs) || 0,
    reportStartDate: data.reportStartDate,
    reportEndDate: data.reportEndDate,
  };
}

/** Working-day count in month through ISO date (inclusive), Mon–Fri only. */
export function workingDaysThroughIsoDate(isoDate: string, referenceDate = new Date()): number {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 0;

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month) {
    return 0;
  }

  let count = 0;
  for (let day = 1; day <= parsed.getDate(); day++) {
    const dow = new Date(year, month, day).getDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}
