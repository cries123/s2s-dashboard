import type { Firestore } from 'firebase-admin/firestore';
import { pbsEmployeeGet, pbsRepairOrderGet, pbsTimeClockActivityGet } from './partnerHubClient.js';
import {
  aggregateFlaggedHoursByTech,
  aggregateTechnicianPerformance,
  normalizeTechKey,
} from './pbsTechnicianAggregator.js';
import type { PbsEmployee, PbsTimeClockActivity } from './pbsExtendedTypes.js';
import type { PbsRepairOrderFull } from './pbsPerformanceTypes.js';
import {
  dealershipSettingsDoc,
  serverTimestamp,
  stripUndefinedDeep,
  technicianPerformanceDoc,
} from './pbsFirestore.js';

function monthDateCriteria(start: string, end: string): Record<string, unknown> {
  return {
    StartDate: `${start}T00:00:00.0000000-07:00`,
    EndDate: `${end}T23:59:59.9999999-07:00`,
    TechniciansOnly: true,
  };
}

function monthCashieredCriteria(start: string, end: string): Record<string, unknown> {
  return {
    CashieredSince: `${start}T00:00:00.0000000-07:00`,
    CashieredUntil: `${end}T23:59:59.9999999-07:00`,
  };
}

function openRoCriteria(monthStart: string): Record<string, unknown> {
  return {
    OpenDateSince: `${monthStart}T00:00:00.0000000-07:00`,
  };
}

function repairOrderKey(ro: PbsRepairOrderFull): string {
  return String(
    ro.RepairOrderId || ro.RawRepairOrderNumber || ro.RepairOrderNumber || ''
  ).trim();
}

function mergeRepairOrdersForFlagged(
  cashiered: PbsRepairOrderFull[],
  open: PbsRepairOrderFull[]
): PbsRepairOrderFull[] {
  const merged = new Map<string, PbsRepairOrderFull>();
  for (const ro of [...cashiered, ...open]) {
    const key = repairOrderKey(ro);
    if (!key) continue;
    merged.set(key, ro);
  }
  return [...merged.values()];
}

function performanceReportEndDate(monthEnd: string, reference = new Date()): string {
  const today = reference.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return today < monthEnd ? today : monthEnd;
}

async function loadTechLabelMap(
  db: Firestore,
  dealershipId: string
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const snap = await dealershipSettingsDoc(db, dealershipId).get();
  const roster = snap.data()?.dispatchTechRoster;
  if (!Array.isArray(roster)) return labels;

  for (const row of roster) {
    const id = normalizeTechKey(String(row?.id || ''));
    const label = String(row?.label || '').trim();
    if (id && label) labels.set(id, label);
  }

  return labels;
}

export async function syncPbsTechnicianPerformance(
  db: Firestore,
  dealershipId: string,
  monthStart: string,
  monthEnd: string,
  syncedAt: string
): Promise<{ technicians: number; clockActivities: number; flaggedTechs: number }> {
  const [clockResponse, employeeResponse, cashieredResponse, openResponse, techLabelByKey] =
    await Promise.all([
      pbsTimeClockActivityGet(monthDateCriteria(monthStart, monthEnd)),
      pbsEmployeeGet({ IncludeInactive: false }),
      pbsRepairOrderGet(monthCashieredCriteria(monthStart, monthEnd)),
      pbsRepairOrderGet(openRoCriteria(monthStart)),
      loadTechLabelMap(db, dealershipId),
    ]);

  const activities = (clockResponse.TimeClockActivities || []) as PbsTimeClockActivity[];
  const employees = (employeeResponse.Employees || []) as PbsEmployee[];
  const cashieredOrders = (cashieredResponse.RepairOrders || []) as PbsRepairOrderFull[];
  const openOrders = (openResponse.RepairOrders || []) as PbsRepairOrderFull[];
  const repairOrders = mergeRepairOrdersForFlagged(cashieredOrders, openOrders);
  const flaggedByTech = aggregateFlaggedHoursByTech(repairOrders);
  const aggregate = aggregateTechnicianPerformance(
    activities,
    employees,
    flaggedByTech,
    monthStart,
    monthEnd,
    techLabelByKey
  );

  const reportEndDate = performanceReportEndDate(monthEnd);

  const existingSnap = await technicianPerformanceDoc(db, dealershipId).get();
  const existing = existingSnap.exists ? existingSnap.data() : undefined;
  const preserveImported =
    existing &&
    (existing.source === 'tech-pdf' || existing.source === 'dms-pdf') &&
    Array.isArray(existing.technicians) &&
    existing.technicians.length > 0;

  await technicianPerformanceDoc(db, dealershipId).set(
    stripUndefinedDeep({
      technicians: preserveImported ? existing.technicians : aggregate.technicians,
      reportStartDate: aggregate.reportStartDate,
      reportEndDate,
      source: preserveImported ? existing.source : 'pbs-sync',
      pbsSyncedAt: syncedAt,
      pbsRepairOrdersForFlagged: repairOrders.length,
      pbsClockActivities: activities.length,
      updatedAt: serverTimestamp(),
    }),
    { merge: false }
  );

  console.log(
    `[PBS Sync] Technician performance written: ${preserveImported ? existing!.technicians!.length : aggregate.technicians.length} techs from ${activities.length} clock punches, ${repairOrders.length} ROs (${cashieredOrders.length} cashiered + ${openOrders.length} open), ${flaggedByTech.size} flagged-tech buckets`
  );

  return {
    technicians: preserveImported ? existing!.technicians!.length : aggregate.technicians.length,
    clockActivities: activities.length,
    flaggedTechs: flaggedByTech.size,
  };
}
