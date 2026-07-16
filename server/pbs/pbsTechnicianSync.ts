import type { Firestore } from 'firebase-admin/firestore';
import {
  PbsPartnerHubError,
  pbsEmployeeGet,
  pbsRepairOrderGet,
  pbsTimeClockActivityGet,
} from './partnerHubClient.js';
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

function pbs401Message(operation: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const is401 =
    (err instanceof PbsPartnerHubError && err.status === 401) || message.includes('401');
  return is401
    ? `${operation} is not enabled for these PBS PartnerHUB credentials (401) — ask PBS support to grant it.`
    : message;
}

/** Time clock is optional — many PBS accounts return 401 for TimeClockActivityGet. */
async function fetchTimeClockActivitiesOptional(
  monthStart: string,
  monthEnd: string
): Promise<{ activities: PbsTimeClockActivity[]; skippedReason?: string }> {
  try {
    const response = await pbsTimeClockActivityGet(monthDateCriteria(monthStart, monthEnd));
    return { activities: (response.TimeClockActivities || []) as PbsTimeClockActivity[] };
  } catch (err) {
    const reason = pbs401Message('TimeClockActivityGet', err);
    console.warn(`[PBS Sync] Time clock unavailable — flagged hours only: ${reason}`);
    return { activities: [], skippedReason: reason };
  }
}

/** Employee list is optional — names fall back to the dispatch tech roster. */
async function fetchEmployeesOptional(): Promise<{
  employees: PbsEmployee[];
  skippedReason?: string;
}> {
  try {
    const response = await pbsEmployeeGet({ IncludeInactive: false });
    return { employees: (response.Employees || []) as PbsEmployee[] };
  } catch (err) {
    const reason = pbs401Message('EmployeeGet', err);
    console.warn(`[PBS Sync] Employee list unavailable — using tech roster labels: ${reason}`);
    return { employees: [], skippedReason: reason };
  }
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
): Promise<{
  technicians: number;
  clockActivities: number;
  flaggedTechs: number;
  warning?: string;
}> {
  const [clockResult, employeeResult, cashieredResponse, openResponse, techLabelByKey] =
    await Promise.all([
      fetchTimeClockActivitiesOptional(monthStart, monthEnd),
      fetchEmployeesOptional(),
      pbsRepairOrderGet(monthCashieredCriteria(monthStart, monthEnd)),
      pbsRepairOrderGet(openRoCriteria(monthStart)),
      loadTechLabelMap(db, dealershipId),
    ]);

  const activities = clockResult.activities;
  const employees = employeeResult.employees;
  const clockDataUnavailable = Boolean(clockResult.skippedReason);
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

  // Without clock punches, an efficiency percentage would be meaningless —
  // zero it out and let the UI show flagged hours only.
  const technicians = clockDataUnavailable
    ? aggregate.technicians.map((tech) => ({ ...tech, clockedHours: 0, efficiency: 0 }))
    : aggregate.technicians;

  const reportEndDate = performanceReportEndDate(monthEnd);

  const existingSnap = await technicianPerformanceDoc(db, dealershipId).get();
  const existing = existingSnap.exists ? existingSnap.data() : undefined;
  const preserveImported =
    existing &&
    (existing.source === 'tech-pdf' || existing.source === 'dms-pdf') &&
    Array.isArray(existing.technicians) &&
    existing.technicians.length > 0;

  const warning = clockResult.skippedReason
    ? `Time clock unavailable: ${clockResult.skippedReason}`
    : employeeResult.skippedReason
      ? `Employee names unavailable: ${employeeResult.skippedReason}`
      : undefined;

  await technicianPerformanceDoc(db, dealershipId).set(
    stripUndefinedDeep({
      technicians: preserveImported ? existing.technicians : technicians,
      reportStartDate: aggregate.reportStartDate,
      reportEndDate,
      source: preserveImported ? existing.source : 'pbs-sync',
      pbsSyncedAt: syncedAt,
      pbsRepairOrdersForFlagged: repairOrders.length,
      pbsClockActivities: activities.length,
      clockDataUnavailable,
      clockDataUnavailableReason: clockResult.skippedReason,
      updatedAt: serverTimestamp(),
    }),
    { merge: false }
  );

  console.log(
    `[PBS Sync] Technician performance written: ${preserveImported ? existing!.technicians!.length : technicians.length} techs from ${activities.length} clock punches, ${repairOrders.length} ROs (${cashieredOrders.length} cashiered + ${openOrders.length} open), ${flaggedByTech.size} flagged-tech buckets${clockDataUnavailable ? ' [clock data unavailable]' : ''}`
  );

  return {
    technicians: preserveImported ? existing!.technicians!.length : technicians.length,
    clockActivities: activities.length,
    flaggedTechs: flaggedByTech.size,
    warning,
  };
}
