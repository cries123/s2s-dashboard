import type { Firestore } from 'firebase-admin/firestore';
import { pbsPartsInvoiceGet, pbsRepairOrderGet } from './partnerHubClient.js';
import { aggregatePbsAdvisorPerformance } from './pbsPerformanceAggregator.js';
import type { PbsPartsInvoiceFull, PbsRepairOrderFull } from './pbsPerformanceTypes.js';
import { filterAdvisorsByPerformanceRoster } from './pbsAdvisorName.js';
import { advisorPerformanceDoc, dealershipSettingsDoc, serverTimestamp, stripUndefinedDeep } from './pbsFirestore.js';

const HYUNDAI_PERFORMANCE_ROSTER = [
  { label: 'Frank' },
  { label: 'Lemmy' },
  { label: 'Jaryn' },
];

async function loadPerformanceAdvisorRoster(
  db: Firestore,
  dealershipId: string
): Promise<{ label: string }[]> {
  const snap = await dealershipSettingsDoc(db, dealershipId).get();
  const fromSettings = snap.data()?.performanceAdvisorRoster;
  if (Array.isArray(fromSettings) && fromSettings.length > 0) {
    return fromSettings.map((row: { label?: string }) => ({ label: String(row.label || '') })).filter((row) => row.label);
  }
  if (dealershipId === 'hyundai') return HYUNDAI_PERFORMANCE_ROSTER;
  return [];
}

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
  const roster = await loadPerformanceAdvisorRoster(db, dealershipId);
  const advisors = filterAdvisorsByPerformanceRoster(aggregate.advisors, roster);
  const totals = advisors.length
    ? {
        totalSales: Math.round(advisors.reduce((sum, row) => sum + row.totalSales, 0) * 100) / 100,
        totalLabor: Math.round(advisors.reduce((sum, row) => sum + row.laborSold, 0) * 100) / 100,
        totalGross: Math.round(advisors.reduce((sum, row) => sum + row.grossLabor, 0) * 100) / 100,
        totalParts: Math.round(advisors.reduce((sum, row) => sum + row.partsSold, 0) * 100) / 100,
        totalGrossParts: Math.round(advisors.reduce((sum, row) => sum + row.grossParts, 0) * 100) / 100,
        totalHrs: Math.round(advisors.reduce((sum, row) => sum + row.hrsSold, 0) * 100) / 100,
      }
    : aggregate.totals;
  const reportEndDate = performanceReportEndDate(monthEnd);

  await advisorPerformanceDoc(db, dealershipId).set(
    stripUndefinedDeep({
      advisors,
      totals,
      reportStartDate: aggregate.reportStartDate,
      reportEndDate,
      source: 'pbs-sync',
      pbsSyncedAt: syncedAt,
      updatedAt: serverTimestamp(),
    }),
    { merge: false }
  );

  console.log(
    `[PBS Sync] Advisor performance written: ${advisors.length} advisors, labor gross $${totals.totalGross}, parts gross $${totals.totalGrossParts}`
  );

  return {
    advisors: advisors.length,
    repairOrdersProcessed: aggregate.repairOrdersProcessed,
    partsInvoicesProcessed: aggregate.partsInvoicesProcessed,
    totalGross: totals.totalGross,
    totalGrossParts: totals.totalGrossParts,
  };
}
