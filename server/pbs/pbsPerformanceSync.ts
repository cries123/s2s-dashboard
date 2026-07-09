import type { Firestore } from 'firebase-admin/firestore';
import { pbsPartsInvoiceGet, pbsRepairOrderGet, PbsPartnerHubError } from './partnerHubClient.js';
import { aggregatePbsAdvisorPerformance } from './pbsPerformanceAggregator.js';
import type { PbsPartsInvoiceFull, PbsRepairOrderFull } from './pbsPerformanceTypes.js';
import { advisorPerformanceDoc, serverTimestamp, stripUndefinedDeep } from './pbsFirestore.js';

function monthCashieredCriteria(start: string, end: string): Record<string, unknown> {
  return {
    CashieredSince: `${start}T00:00:00.0000000-07:00`,
    CashieredUntil: `${end}T23:59:59.9999999-07:00`,
  };
}

async function fetchCashieredRepairOrders(monthStart: string, monthEnd: string): Promise<PbsRepairOrderFull[]> {
  const response = await pbsRepairOrderGet(monthCashieredCriteria(monthStart, monthEnd));
  return (response.RepairOrders || []) as PbsRepairOrderFull[];
}

async function fetchCashieredPartsInvoices(monthStart: string, monthEnd: string): Promise<PbsPartsInvoiceFull[]> {
  const response = await pbsPartsInvoiceGet(monthCashieredCriteria(monthStart, monthEnd));
  return (response.PartsInvoices || []) as PbsPartsInvoiceFull[];
}

/** Parts invoices are optional — many PBS accounts return 401 for PartsInvoiceGet. */
async function fetchCashieredPartsInvoicesOptional(
  monthStart: string,
  monthEnd: string
): Promise<{ invoices: PbsPartsInvoiceFull[]; skippedReason?: string }> {
  try {
    const invoices = await fetchCashieredPartsInvoices(monthStart, monthEnd);
    return { invoices };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAccessDenied =
      (err instanceof PbsPartnerHubError && err.status === 401) ||
      message.includes('401');
    console.warn(
      `[PBS Sync] PartsInvoiceGet ${isAccessDenied ? 'unauthorized (401)' : 'failed'} — advisor performance will use cashiered ROs only:`,
      message
    );
    return {
      invoices: [],
      skippedReason: message,
    };
  }
}

function performanceReportEndDate(monthEnd: string, reference = new Date()): string {
  const today = reference.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return today < monthEnd ? today : monthEnd;
}

export async function syncPbsAdvisorPerformance(
  db: Firestore,
  dealershipId: string,
  monthStart: string,
  monthEnd: string,
  syncedAt: string
): Promise<{
  advisors: number;
  repairOrdersProcessed: number;
  partsInvoicesProcessed: number;
  totalGross: number;
  totalGrossParts: number;
  partsInvoicesSkipped?: boolean;
  partsInvoicesSkipReason?: string;
}> {
  const repairOrders = await fetchCashieredRepairOrders(monthStart, monthEnd);
  const { invoices: partsInvoices, skippedReason } = await fetchCashieredPartsInvoicesOptional(
    monthStart,
    monthEnd
  );

  console.log(
    `[PBS Sync] Performance sources: ${repairOrders.length} cashiered ROs, ${partsInvoices.length} parts invoices (${monthStart}..${monthEnd})${skippedReason ? ' [parts invoices skipped]' : ''}`
  );

  const aggregate = aggregatePbsAdvisorPerformance(repairOrders, partsInvoices, monthStart, monthEnd);
  const reportEndDate = performanceReportEndDate(monthEnd);

  const existingSnap = await advisorPerformanceDoc(db, dealershipId).get();
  const existing = existingSnap.exists ? existingSnap.data() : undefined;
  const preserveImportedLabor =
    existing &&
    (existing.source === 'csr-pdf' || existing.source === 'dms-pdf') &&
    Number(existing.totals?.totalGross) > 0;

  const totalsToWrite = preserveImportedLabor
    ? {
        ...aggregate.totals,
        totalGross: Number(existing.totals?.totalGross) || aggregate.totals.totalGross,
        totalLabor: Number(existing.totals?.totalLabor) || aggregate.totals.totalLabor,
        totalHrs: Number(existing.totals?.totalHrs) || aggregate.totals.totalHrs,
      }
    : aggregate.totals;

  await advisorPerformanceDoc(db, dealershipId).set(
    stripUndefinedDeep({
      advisors: aggregate.advisors,
      totals: totalsToWrite,
      reportStartDate: aggregate.reportStartDate,
      reportEndDate,
      source: preserveImportedLabor ? existing.source : 'pbs-sync',
      pbsSyncedAt: syncedAt,
      partsInvoicesSkipped: Boolean(skippedReason),
      partsInvoicesSkipReason: skippedReason,
      laborGrossPreservedFromImport: preserveImportedLabor || undefined,
      updatedAt: serverTimestamp(),
    }),
    { merge: false }
  );

  console.log(
    `[PBS Sync] Advisor performance written: ${aggregate.advisors.length} advisors, labor gross $${aggregate.totals.totalGross}, parts gross $${aggregate.totals.totalGrossParts}`
  );

  return {
    advisors: aggregate.advisors.length,
    repairOrdersProcessed: aggregate.repairOrdersProcessed,
    partsInvoicesProcessed: aggregate.partsInvoicesProcessed,
    totalGross: aggregate.totals.totalGross,
    totalGrossParts: aggregate.totals.totalGrossParts,
    partsInvoicesSkipped: Boolean(skippedReason),
    partsInvoicesSkipReason: skippedReason,
  };
}
