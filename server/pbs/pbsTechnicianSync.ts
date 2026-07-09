import type { Firestore } from 'firebase-admin/firestore';
import { pbsEmployeeGet, pbsRepairOrderGet, pbsTimeClockActivityGet } from './partnerHubClient.js';
import {
  aggregateFlaggedHoursByTech,
  aggregateTechnicianPerformance,
} from './pbsTechnicianAggregator.js';
import type { PbsEmployee, PbsTimeClockActivity } from './pbsExtendedTypes.js';
import type { PbsRepairOrderFull } from './pbsPerformanceTypes.js';
import { serverTimestamp, stripUndefinedDeep, technicianPerformanceDoc } from './pbsFirestore.js';

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

function performanceReportEndDate(monthEnd: string, reference = new Date()): string {
  const today = reference.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return today < monthEnd ? today : monthEnd;
}

export async function syncPbsTechnicianPerformance(
  db: Firestore,
  dealershipId: string,
  monthStart: string,
  monthEnd: string,
  syncedAt: string
): Promise<{ technicians: number; clockActivities: number; flaggedTechs: number }> {
  const [clockResponse, employeeResponse, roResponse] = await Promise.all([
    pbsTimeClockActivityGet(monthDateCriteria(monthStart, monthEnd)),
    pbsEmployeeGet({ IncludeInactive: false }),
    pbsRepairOrderGet(monthCashieredCriteria(monthStart, monthEnd)),
  ]);

  const activities = (clockResponse.TimeClockActivities || []) as PbsTimeClockActivity[];
  const employees = (employeeResponse.Employees || []) as PbsEmployee[];
  const repairOrders = (roResponse.RepairOrders || []) as PbsRepairOrderFull[];
  const flaggedByTech = aggregateFlaggedHoursByTech(repairOrders);
  const aggregate = aggregateTechnicianPerformance(
    activities,
    employees,
    flaggedByTech,
    monthStart,
    monthEnd
  );

  const reportEndDate = performanceReportEndDate(monthEnd);

  await technicianPerformanceDoc(db, dealershipId).set(
    stripUndefinedDeep({
      technicians: aggregate.technicians,
      reportStartDate: aggregate.reportStartDate,
      reportEndDate,
      source: 'pbs-sync',
      pbsSyncedAt: syncedAt,
      updatedAt: serverTimestamp(),
    }),
    { merge: false }
  );

  console.log(
    `[PBS Sync] Technician performance written: ${aggregate.technicians.length} techs from ${activities.length} clock punches and ${flaggedByTech.size} flagged-tech buckets`
  );

  return {
    technicians: aggregate.technicians.length,
    clockActivities: activities.length,
    flaggedTechs: flaggedByTech.size,
  };
}
