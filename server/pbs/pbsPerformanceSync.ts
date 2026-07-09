import type { Firestore } from 'firebase-admin/firestore';
import { pbsPartsInvoiceGet, pbsRepairOrderGet } from './partnerHubClient.js';
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
}> {
  const [repairOrders, partsInvoices] = await Promise.all([
    fetchCashieredRepairOrders(monthStart, monthEnd),
    fetchCashieredPartsInvoices(monthStart, monthEnd),
  ]);

  console.log(
    `[PBS Sync] Performance sources: ${repairOrders.length} cashiered ROs, ${partsInvoices.length} parts invoices (${monthStart}..${monthEnd})`
  );

  const aggregate = aggregatePbsAdvisorPerformance(repairOrders, partsInvoices, monthStart, monthEnd);
  const reportEndDate = performanceReportEndDate(monthEnd);

  await advisorPerformanceDoc(db, dealershipId).set(
    stripUndefinedDeep({
      advisors: aggregate.advisors,
      totals: aggregate.totals,
      reportStartDate: aggregate.reportStartDate,
      reportEndDate,
      source: 'pbs-sync',
      pbsSyncedAt: syncedAt,
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
  };
}
