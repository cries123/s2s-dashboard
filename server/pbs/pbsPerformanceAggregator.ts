import { pbsIsoToDateString, repairOrderSoNumber } from './pbsMappers.js';
import { cleanPbsCsrName, isRealPbsAdvisorName, resolvePbsAdvisorCsr } from './pbsAdvisorName.js';
import type {
  PbsAdvisorPerformanceRow,
  PbsPartLine,
  PbsPartsInvoiceFull,
  PbsPerformanceAggregate,
  PbsRepairOrderFull,
  PbsRepairOrderRequestFull,
} from './pbsPerformanceTypes.js';

interface AdvisorBucket {
  soNumbers: Set<string>;
  hrsSold: number;
  laborSold: number;
  laborCost: number;
  partsSold: number;
  partsCost: number;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isCashieredRepairOrder(ro: PbsRepairOrderFull): boolean {
  const status = (ro.Status || '').toLowerCase();
  if (status.includes('void') || status.includes('cancel')) return false;
  const cashDate = ro.DateCashiered;
  if (!cashDate || cashDate.startsWith('0001-01-01')) return false;
  return true;
}

interface PayTypeBreakdown {
  customer: { labor: number; parts: number };
  warranty: { labor: number; parts: number };
  internal: { labor: number; parts: number };
}

const AMOUNT_EPS_RATIO = 0.02;

function approxGte(actual: number, target: number): boolean {
  if (target <= 0) return false;
  return actual >= target * (1 - AMOUNT_EPS_RATIO);
}

function readPayTypeBreakdown(ro: PbsRepairOrderFull): PayTypeBreakdown {
  return {
    customer: {
      labor: num(ro.CustomerSummary?.Labour),
      parts: num(ro.CustomerSummary?.Parts),
    },
    warranty: {
      labor: num(ro.WarrantySummary?.Labour),
      parts: num(ro.WarrantySummary?.Parts),
    },
    internal: {
      labor: num(ro.InternalSummary?.Labour),
      parts: num(ro.InternalSummary?.Parts),
    },
  };
}

function allSummaryTotals(breakdown: PayTypeBreakdown): { labor: number; parts: number } {
  return {
    labor: breakdown.customer.labor + breakdown.warranty.labor + breakdown.internal.labor,
    parts: breakdown.customer.parts + breakdown.warranty.parts + breakdown.internal.parts,
  };
}

function sumPayTypeSummaries(ro: PbsRepairOrderFull): {
  laborSold: number;
  partsSold: number;
} {
  const all = allSummaryTotals(readPayTypeBreakdown(ro));
  return { laborSold: all.labor, partsSold: all.parts };
}

/**
 * Warranty/internal dollars to add on top of request lines.
 * PBS often echoes the same parts/labor in both PartLines and pay-type summaries — skip those duplicates.
 */
export function supplementalPayTypeAmounts(
  ro: PbsRepairOrderFull,
  lineTotals: { laborSold: number; partsSold: number }
): {
  laborSold: number;
  laborCost: number;
  partsSold: number;
  partsCost: number;
  hrsSold: number;
} {
  const payTypes = readPayTypeBreakdown(ro);
  const all = allSummaryTotals(payTypes);
  const { laborSold: lineLabor, partsSold: lineParts } = lineTotals;

  const addLabor = payTypes.warranty.labor + payTypes.internal.labor;
  const addParts = payTypes.warranty.parts + payTypes.internal.parts;

  if (addLabor <= 0 && addParts <= 0) {
    return { laborSold: 0, laborCost: 0, partsSold: 0, partsCost: 0, hrsSold: 0 };
  }

  let laborSupplement = addLabor;
  let partsSupplement = addParts;

  if (partsSupplement > 0 && approxGte(lineParts, all.parts)) {
    partsSupplement = 0;
  } else if (
    partsSupplement > 0 &&
    payTypes.customer.parts > 0 &&
    approxGte(lineParts, payTypes.customer.parts) &&
    approxGte(payTypes.warranty.parts + payTypes.internal.parts, lineParts)
  ) {
    // PBS echoed the same parts total on a warranty/internal summary row.
    partsSupplement = 0;
  }

  const customerLabor = payTypes.customer.labor;
  if (laborSupplement > 0) {
    if (customerLabor > 0 && approxGte(lineLabor, customerLabor + laborSupplement)) {
      laborSupplement = 0;
    } else if (
      customerLabor <= 0 &&
      all.labor > 0 &&
      approxGte(lineLabor, all.labor) &&
      lineLabor <= all.labor * (1 + AMOUNT_EPS_RATIO)
    ) {
      laborSupplement = 0;
    }
  }

  return {
    laborSold: laborSupplement,
    laborCost: 0,
    partsSold: partsSupplement,
    partsCost: 0,
    hrsSold: 0,
  };
}

function sumRequestLines(req: PbsRepairOrderRequestFull): {
  laborSold: number;
  laborCost: number;
  partsSold: number;
  partsCost: number;
  hrsSold: number;
} {
  let laborSold = 0;
  let laborCost = 0;
  let partsSold = 0;
  let partsCost = 0;
  let hrsSold = 0;

  for (const line of req.LabourLines || []) {
    laborSold += num(line.Price);
    laborCost += num(line.Cost);
    hrsSold += num(line.SoldHours);
  }

  for (const line of req.PartLines || []) {
    const qty = num(line.Shipped) || num(line.Requested) || 1;
    partsSold += num(line.ExtendedPrice) || num(line.UnitPrice) * qty;
    partsCost += num(line.Cost) * qty;
  }

  if (laborSold === 0 && partsSold === 0 && req.Summary) {
    laborSold += num(req.Summary.Labour);
    partsSold += num(req.Summary.Parts);
  }

  return { laborSold, laborCost, partsSold, partsCost, hrsSold };
}

function sumRepairOrderLinesOnly(ro: PbsRepairOrderFull): {
  laborSold: number;
  laborCost: number;
  partsSold: number;
  partsCost: number;
  hrsSold: number;
} {
  let laborSold = 0;
  let laborCost = 0;
  let partsSold = 0;
  let partsCost = 0;
  let hrsSold = 0;

  for (const req of ro.Requests || []) {
    const part = sumRequestLines(req);
    laborSold += part.laborSold;
    laborCost += part.laborCost;
    partsSold += part.partsSold;
    partsCost += part.partsCost;
    hrsSold += part.hrsSold;
  }

  return { laborSold, laborCost, partsSold, partsCost, hrsSold };
}

function sumRepairOrder(ro: PbsRepairOrderFull): {
  laborSold: number;
  laborCost: number;
  partsSold: number;
  partsCost: number;
  hrsSold: number;
} {
  const fromLines = sumRepairOrderLinesOnly(ro);
  if (fromLines.laborSold > 0 || fromLines.partsSold > 0 || fromLines.hrsSold > 0) {
    return fromLines;
  }

  const summary = sumPayTypeSummaries(ro);
  return {
    ...fromLines,
    laborSold: summary.laborSold,
    partsSold: summary.partsSold,
  };
}

/** Shop-wide labor for an RO — includes warranty/internal summary labor missed by request lines alone. */
export function sumRepairOrderShopLabor(ro: PbsRepairOrderFull): {
  laborSold: number;
  laborGross: number;
  hrsSold: number;
} {
  const base = sumRepairOrder(ro);
  let { laborSold, laborCost, hrsSold } = base;

  const requests = ro.Requests || [];
  let hasRequestAmounts = false;
  for (const req of requests) {
    const amounts = sumRequestLines(req);
    if (amounts.laborSold > 0 || amounts.partsSold > 0 || amounts.hrsSold > 0) {
      hasRequestAmounts = true;
      break;
    }
  }

  if (!hasRequestAmounts) {
    return {
      laborSold,
      laborGross: Math.max(0, laborSold - laborCost),
      hrsSold,
    };
  }

  const lineGross = Math.max(0, laborSold - laborCost);
  const gpRate = laborSold > 0 ? lineGross / laborSold : 0;

  const supplement = supplementalPayTypeAmounts(ro, {
    laborSold: base.laborSold,
    partsSold: base.partsSold,
  });
  if (supplement.laborSold > 0) {
    laborSold += supplement.laborSold;
    laborCost += supplement.laborSold * (1 - gpRate);
  }

  return {
    laborSold,
    laborGross: Math.max(0, laborSold - laborCost),
    hrsSold,
  };
}

function getBucket(buckets: Map<string, AdvisorBucket>, advisor: string): AdvisorBucket {
  let bucket = buckets.get(advisor);
  if (!bucket) {
    bucket = {
      soNumbers: new Set(),
      hrsSold: 0,
      laborSold: 0,
      laborCost: 0,
      partsSold: 0,
      partsCost: 0,
    };
    buckets.set(advisor, bucket);
  }
  return bucket;
}

function addToBucket(
  buckets: Map<string, AdvisorBucket>,
  advisorRaw: string,
  amounts: {
    laborSold: number;
    laborCost: number;
    partsSold: number;
    partsCost: number;
    hrsSold: number;
  },
  soNumber?: string,
  aliases?: Map<string, string>
): void {
  const advisor = cleanPbsCsrName(advisorRaw, aliases);
  if (!advisor || !isRealPbsAdvisorName(advisor)) return;

  const bucket = getBucket(buckets, advisor);
  if (soNumber) bucket.soNumbers.add(soNumber);
  bucket.hrsSold += amounts.hrsSold;
  bucket.laborSold += amounts.laborSold;
  bucket.laborCost += amounts.laborCost;
  bucket.partsSold += amounts.partsSold;
  bucket.partsCost += amounts.partsCost;
}

function attributeRepairOrder(
  buckets: Map<string, AdvisorBucket>,
  ro: PbsRepairOrderFull,
  aliases?: Map<string, string>
): void {
  const soNumber = repairOrderSoNumber(ro);
  const defaultAdvisor = ro.CSR || '';
  const requests = ro.Requests || [];

  if (requests.length === 0) {
    addToBucket(buckets, defaultAdvisor, sumRepairOrder(ro), soNumber || undefined, aliases);
    return;
  }

  let attributed = false;

  for (const req of requests) {
    const advisor = resolvePbsAdvisorCsr(req.CSR, defaultAdvisor, aliases);
    const amounts = sumRequestLines(req);
    if (
      amounts.laborSold === 0 &&
      amounts.partsSold === 0 &&
      amounts.hrsSold === 0
    ) {
      continue;
    }
    addToBucket(buckets, advisor, amounts, soNumber || undefined, aliases);
    attributed = true;
  }

  if (attributed) {
    const lineTotals = sumRepairOrderLinesOnly(ro);
    const supplement = supplementalPayTypeAmounts(ro, lineTotals);
    if (supplement.laborSold > 0 || supplement.partsSold > 0) {
      const advisor = resolvePbsAdvisorCsr(defaultAdvisor, defaultAdvisor, aliases);
      addToBucket(buckets, advisor, supplement, soNumber || undefined, aliases);
    }
    return;
  }

  addToBucket(buckets, defaultAdvisor, sumRepairOrder(ro), soNumber || undefined, aliases);
}

function attributePartLines(
  buckets: Map<string, AdvisorBucket>,
  lines: PbsPartLine[] | undefined,
  fallbackAdvisor: string,
  invoiceRef?: string,
  aliases?: Map<string, string>
): void {
  for (const line of lines || []) {
    const qty = num(line.Shipped) || num(line.Requested) || 1;
    const partsSold = num(line.ExtendedPrice) || num(line.UnitPrice) * qty;
    const partsCost = num(line.Cost) * qty;
    if (partsSold === 0 && partsCost === 0) continue;

    addToBucket(
      buckets,
      resolvePbsAdvisorCsr(line.CSR, fallbackAdvisor, aliases) || fallbackAdvisor,
      {
        laborSold: 0,
        laborCost: 0,
        partsSold,
        partsCost,
        hrsSold: 0,
      },
      invoiceRef,
      aliases
    );
  }
}

function finalizeAdvisors(buckets: Map<string, AdvisorBucket>): PbsAdvisorPerformanceRow[] {
  return Array.from(buckets.entries())
    .map(([name, bucket]) => {
      const grossLabor = Math.max(0, bucket.laborSold - bucket.laborCost);
      const grossParts = Math.max(0, bucket.partsSold - bucket.partsCost);
      const totalSales = bucket.laborSold + bucket.partsSold;
      const totalGross = grossLabor + grossParts;
      const gpPercent = totalSales > 0 ? Math.round((totalGross / totalSales) * 1000) / 10 : 0;
      const elr = bucket.hrsSold > 0 ? Math.round((grossLabor / bucket.hrsSold) * 100) / 100 : 0;

      return {
        name,
        soCount: bucket.soNumbers.size,
        hrsSold: Math.round(bucket.hrsSold * 100) / 100,
        laborSold: Math.round(bucket.laborSold * 100) / 100,
        grossLabor: Math.round(grossLabor * 100) / 100,
        partsSold: Math.round(bucket.partsSold * 100) / 100,
        grossParts: Math.round(grossParts * 100) / 100,
        totalSales: Math.round(totalSales * 100) / 100,
        gpPercent,
        elr,
        upsells: [],
      };
    })
    .filter((row) => row.totalSales > 0 || row.soCount > 0)
    .sort((a, b) => b.grossLabor + b.grossParts - (a.grossLabor + a.grossParts));
}

function finalizeTotals(advisors: PbsAdvisorPerformanceRow[]): PbsPerformanceAggregate['totals'] {
  const totalLabor = advisors.reduce((sum, row) => sum + row.laborSold, 0);
  const totalParts = advisors.reduce((sum, row) => sum + row.partsSold, 0);
  const totalGross = advisors.reduce((sum, row) => sum + row.grossLabor, 0);
  const totalGrossParts = advisors.reduce((sum, row) => sum + row.grossParts, 0);
  const totalHrs = advisors.reduce((sum, row) => sum + row.hrsSold, 0);

  return {
    totalSales: Math.round((totalLabor + totalParts) * 100) / 100,
    totalLabor: Math.round(totalLabor * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
    totalParts: Math.round(totalParts * 100) / 100,
    totalGrossParts: Math.round(totalGrossParts * 100) / 100,
    totalHrs: Math.round(totalHrs * 100) / 100,
  };
}

/** Collect every raw CSR string on RO headers, requests, and lines (alias source). */
export function collectRepairOrderCsrStrings(repairOrders: PbsRepairOrderFull[]): string[] {
  const strings: string[] = [];
  for (const ro of repairOrders) {
    if (ro.CSR) strings.push(ro.CSR);
    for (const req of ro.Requests || []) {
      if (req.CSR) strings.push(req.CSR);
      for (const line of req.LabourLines || []) {
        if (line.CSR) strings.push(line.CSR);
      }
      for (const line of req.PartLines || []) {
        if (line.CSR) strings.push(line.CSR);
      }
    }
  }
  return strings;
}

export function aggregatePbsAdvisorPerformance(
  repairOrders: PbsRepairOrderFull[],
  partsInvoices: PbsPartsInvoiceFull[],
  monthStart: string,
  monthEnd: string,
  aliases?: Map<string, string>
): PbsPerformanceAggregate {
  const buckets = new Map<string, AdvisorBucket>();
  let repairOrdersProcessed = 0;
  let partsInvoicesProcessed = 0;
  let shopLaborSold = 0;
  let shopLaborGross = 0;
  let shopHrsSold = 0;

  for (const ro of repairOrders) {
    if (!isCashieredRepairOrder(ro)) continue;
    const cashDate = pbsIsoToDateString(ro.DateCashiered);
    if (!cashDate || cashDate < monthStart || cashDate > monthEnd) continue;

    const shopLabor = sumRepairOrderShopLabor(ro);
    shopLaborSold += shopLabor.laborSold;
    shopLaborGross += shopLabor.laborGross;
    shopHrsSold += shopLabor.hrsSold;

    attributeRepairOrder(buckets, ro, aliases);
    repairOrdersProcessed += 1;
  }

  for (const invoice of partsInvoices) {
    const status = (invoice.Status || '').toLowerCase();
    if (status.includes('void') || status.includes('cancel')) continue;
    const cashDate = pbsIsoToDateString(invoice.DateCashiered);
    if (!cashDate || cashDate < monthStart || cashDate > monthEnd) continue;

    const invoiceRef = invoice.RawPartsInvoiceNumber || String(invoice.InvoiceNumber || '');
    attributePartLines(buckets, invoice.PartLines, '', invoiceRef || undefined, aliases);

    if ((invoice.PartLines || []).length === 0 && invoice.Summary) {
      const partsSold = num(invoice.Summary.Sales) || num(invoice.Summary.TotalInvoice);
      if (partsSold > 0) {
        addToBucket(
          buckets,
          'Parts Counter',
          {
            laborSold: 0,
            laborCost: 0,
            partsSold,
            partsCost: 0,
            hrsSold: 0,
          },
          invoiceRef || undefined
        );
      }
    }

    partsInvoicesProcessed += 1;
  }

  const advisors = finalizeAdvisors(buckets);
  const advisorTotals = finalizeTotals(advisors);
  const totals: PbsPerformanceAggregate['totals'] = {
    ...advisorTotals,
    totalLabor: Math.round(shopLaborSold * 100) / 100,
    totalGross: Math.round(shopLaborGross * 100) / 100,
    totalHrs: Math.round(shopHrsSold * 100) / 100,
    totalSales: Math.round((shopLaborSold + advisorTotals.totalParts) * 100) / 100,
  };

  return {
    advisors,
    totals,
    reportStartDate: monthStart,
    reportEndDate: monthEnd,
    repairOrdersProcessed,
    partsInvoicesProcessed,
  };
}
