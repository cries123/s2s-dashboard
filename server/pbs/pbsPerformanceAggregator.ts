import { pbsIsoToDateString, repairOrderSoNumber } from './pbsMappers.js';
import { cleanPbsCsrName, isRealPbsAdvisorName } from './pbsAdvisorName.js';
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

function sumRepairOrder(ro: PbsRepairOrderFull): {
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

  if (laborSold === 0 && partsSold === 0) {
    const summary = ro.CustomerSummary || ro.WarrantySummary || ro.InternalSummary;
    if (summary) {
      laborSold += num(summary.Labour);
      partsSold += num(summary.Parts);
    }
  }

  return { laborSold, laborCost, partsSold, partsCost, hrsSold };
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
  soNumber?: string
): void {
  const advisor = cleanPbsCsrName(advisorRaw);
  if (!advisor || !isRealPbsAdvisorName(advisor)) return;

  const bucket = getBucket(buckets, advisor);
  if (soNumber) bucket.soNumbers.add(soNumber);
  bucket.hrsSold += amounts.hrsSold;
  bucket.laborSold += amounts.laborSold;
  bucket.laborCost += amounts.laborCost;
  bucket.partsSold += amounts.partsSold;
  bucket.partsCost += amounts.partsCost;
}

function attributeRepairOrder(buckets: Map<string, AdvisorBucket>, ro: PbsRepairOrderFull): void {
  const soNumber = repairOrderSoNumber(ro);
  const defaultAdvisor = ro.CSR || '';
  const requests = ro.Requests || [];

  if (requests.length === 0) {
    addToBucket(buckets, defaultAdvisor, sumRepairOrder(ro), soNumber || undefined);
    return;
  }

  let attributed = false;
  for (const req of requests) {
    const advisor = req.CSR || defaultAdvisor;
    const amounts = sumRequestLines(req);
    if (
      amounts.laborSold === 0 &&
      amounts.partsSold === 0 &&
      amounts.hrsSold === 0
    ) {
      continue;
    }
    addToBucket(buckets, advisor, amounts, soNumber || undefined);
    attributed = true;
  }

  if (!attributed) {
    addToBucket(buckets, defaultAdvisor, sumRepairOrder(ro), soNumber || undefined);
  }
}

function attributePartLines(
  buckets: Map<string, AdvisorBucket>,
  lines: PbsPartLine[] | undefined,
  fallbackAdvisor: string,
  invoiceRef?: string
): void {
  for (const line of lines || []) {
    const qty = num(line.Shipped) || num(line.Requested) || 1;
    const partsSold = num(line.ExtendedPrice) || num(line.UnitPrice) * qty;
    const partsCost = num(line.Cost) * qty;
    if (partsSold === 0 && partsCost === 0) continue;

    addToBucket(
      buckets,
      line.CSR || fallbackAdvisor,
      {
        laborSold: 0,
        laborCost: 0,
        partsSold,
        partsCost,
        hrsSold: 0,
      },
      invoiceRef
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

export function aggregatePbsAdvisorPerformance(
  repairOrders: PbsRepairOrderFull[],
  partsInvoices: PbsPartsInvoiceFull[],
  monthStart: string,
  monthEnd: string
): PbsPerformanceAggregate {
  const buckets = new Map<string, AdvisorBucket>();
  let repairOrdersProcessed = 0;
  let partsInvoicesProcessed = 0;

  for (const ro of repairOrders) {
    if (!isCashieredRepairOrder(ro)) continue;
    const cashDate = pbsIsoToDateString(ro.DateCashiered);
    if (!cashDate || cashDate < monthStart || cashDate > monthEnd) continue;
    attributeRepairOrder(buckets, ro);
    repairOrdersProcessed += 1;
  }

  for (const invoice of partsInvoices) {
    const status = (invoice.Status || '').toLowerCase();
    if (status.includes('void') || status.includes('cancel')) continue;
    const cashDate = pbsIsoToDateString(invoice.DateCashiered);
    if (!cashDate || cashDate < monthStart || cashDate > monthEnd) continue;

    const invoiceRef = invoice.RawPartsInvoiceNumber || String(invoice.InvoiceNumber || '');
    attributePartLines(buckets, invoice.PartLines, '', invoiceRef || undefined);

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
  const totals = finalizeTotals(advisors);

  return {
    advisors,
    totals,
    reportStartDate: monthStart,
    reportEndDate: monthEnd,
    repairOrdersProcessed,
    partsInvoicesProcessed,
  };
}
