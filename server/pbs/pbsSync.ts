import { Timestamp, type DocumentData, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../admin/initFirebaseAdmin.js';
import {
  pbsAppointmentGet,
  pbsAppointmentContactVehicleInfoGet,
  pbsContactVehicleGet,
  pbsContactVehicleItems,
  pbsRepairOrderGet,
  PbsPartnerHubError,
} from './partnerHubClient.js';
import { isPbsPartnerHubConfigured } from './partnerHubConfig.js';
import {
  aggregateAppointmentsByDay,
  latestVisitDate,
  mapContactVehicleToCustomerFields,
  mapRepairOrderToVisit,
  mergeServiceVisits,
  mergeVehiclePbsServiceVisits,
  normalizePhone,
} from './pbsMappers.js';
import {
  customerBelongsToPbsSyncDealership,
  PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
  pbsAutomatedSyncScopeError,
  resolvePbsAutomatedSyncDealershipId,
} from './pbsDealershipScope.js';
import {
  appointmentTrackerCollection,
  appointmentTrackerDocId,
  commitBatches,
  customersCollection,
  dealershipSettingsDoc,
  serverTimestamp,
  stripUndefinedDeep,
} from './pbsFirestore.js';
import {
  buildAppointmentCustomerLookup,
  buildAppointmentDisplayInfoMap,
  collectUnresolvedContactRefs,
  mergeContactNameFallback,
  normalizePbsRef,
  type PbsAppointmentDisplayInfo,
  syncAppointmentSchedule,
} from './pbsAppointmentSchedule.js';
import { fetchContactNamesByRefs } from './pbsContactNameFallback.js';
import type {
  PbsAppointment,
  PbsAppointmentContactVehicleInfo,
  PbsContactVehicle,
  PbsRepairOrder,
  PbsSyncCounts,
  PbsSyncFetched,
  PbsSyncLogEntry,
  PbsSyncResult,
  PbsSyncStartResult,
  PbsSyncState,
} from './pbsTypes.js';
import { appendPbsSyncLog, buildPbsSyncSummary } from './pbsSyncLogs.js';
import {
  buildPbsCustomerUpdatePatch,
  dedupeContactVehiclesByVin,
} from './pbsCustomerMerge.js';
import { syncPbsAdvisorPerformance } from './pbsPerformanceSync.js';
import { monthRangePacific } from './pbsMonthRange.js';
import { syncPbsDispatchBoard } from './pbsDispatchSync.js';
import { syncPbsVehicleInventory } from './pbsInventorySync.js';
import { syncPbsTechnicianPerformance } from './pbsTechnicianSync.js';
import { syncPbsWorkplanReminders } from './pbsWorkplanReminderSync.js';
import type { PbsCustomerIndexMaps } from './pbsExtendedTypes.js';
import {
  dedupeAppointments,
  dedupeRepairOrders,
  repairOrderChangedSince,
  resolveIncrementalWatermark,
  shouldLogRepairOrderVisit,
  toPbsPacificCriteriaIso,
  yearsAgoPacificCriteria,
} from './pbsIncrementalCriteria.js';

const MAX_RECENT_VISITS = 100;
const REPAIR_ORDER_LOOKBACK_YEARS = 3;

export interface RunPbsSyncOptions {
  dealershipId?: string;
  triggeredBy?: 'cron' | 'manual';
  triggeredByEmail?: string;
  triggeredByUsername?: string;
  /** When true, ignore ModifiedSince watermarks and pull full customer + RO history windows. */
  fullRefresh?: boolean;
  /** When true, start even if a stale syncInProgress flag is still set. */
  force?: boolean;
}

export const PBS_SYNC_STALE_MS = 5 * 60 * 1000;

export function isPbsSyncStateStale(state: PbsSyncState | null | undefined): boolean {
  if (!state?.syncInProgress || !state.syncStartedAt) return false;
  const age = Date.now() - new Date(state.syncStartedAt).getTime();
  return age >= PBS_SYNC_STALE_MS;
}

interface CustomerIndex {
  byVinLast8: Map<string, string>;
  byVin: Map<string, string>;
  byPhone: Map<string, string>;
  byVehicleRef: Map<string, string>;
  byContactRef: Map<string, string>;
  dataById: Map<string, DocumentData>;
}

function emptyFetched(monthStart = '', monthEnd = ''): PbsSyncFetched {
  return {
    contactVehicles: 0,
    repairOrders: 0,
    appointments: 0,
    appointmentMonthStart: monthStart,
    appointmentMonthEnd: monthEnd,
  };
}

function emptyCounts(): PbsSyncCounts {
  return {
    customersCreated: 0,
    customersUpdated: 0,
    ownerChanges: 0,
    visitsMerged: 0,
    visitsLogged: 0,
    appointmentDaysUpdated: 0,
  appointmentsProcessed: 0,
  appointmentScheduleDays: 0,
  appointmentScheduleSlots: 0,
  performanceAdvisors: 0,
    performanceRepairOrders: 0,
    performancePartsInvoices: 0,
    technicianReports: 0,
    timeClockActivities: 0,
    workplanRemindersFetched: 0,
    serviceRemindersUpdated: 0,
    inventoryLots: 0,
    inventoryVehiclesFetched: 0,
    inventoryVehiclesWritten: 0,
    openRepairOrdersFetched: 0,
    dispatchOrdersUpserted: 0,
    dispatchOrdersCompleted: 0,
  };
}

function toCustomerIndexMaps(index: CustomerIndex): PbsCustomerIndexMaps {
  return {
    byContactRef: index.byContactRef,
    byVehicleRef: index.byVehicleRef,
    dataById: index.dataById as Map<string, Record<string, unknown>>,
  };
}

function monthAppointmentCriteria(
  start: string,
  end: string,
  modifiedSince?: string
): Record<string, unknown> {
  const criteria: Record<string, unknown> = {
    AppointmentSince: `${start}T00:00:00.0000000-07:00`,
    AppointmentUntil: `${end}T23:59:59.9999999-07:00`,
  };
  if (modifiedSince) {
    criteria.ModifiedSince = toPbsPacificCriteriaIso(modifiedSince);
  }
  return criteria;
}

async function loadCustomerIndex(
  db: Firestore,
  dealershipId: string
): Promise<CustomerIndex> {
  const snap = await customersCollection(db).get();
  const index: CustomerIndex = {
    byVinLast8: new Map(),
    byVin: new Map(),
    byPhone: new Map(),
    byVehicleRef: new Map(),
    byContactRef: new Map(),
    dataById: new Map(),
  };

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!customerBelongsToPbsSyncDealership(data, dealershipId)) continue;

    index.dataById.set(docSnap.id, data);

    const vinLast8 = String(data.vinLast8 || '').toUpperCase();
    if (vinLast8) index.byVinLast8.set(vinLast8, docSnap.id);

    const vin = String(data.vin || '').toUpperCase();
    if (vin) index.byVin.set(vin, docSnap.id);

    const phone = normalizePhone(String(data.phone || ''));
    if (phone) index.byPhone.set(phone, docSnap.id);

    const vehicleRef = normalizePbsRef(String(data.pbsVehicleId || ''));
    if (vehicleRef) index.byVehicleRef.set(vehicleRef, docSnap.id);

    const contactRef = normalizePbsRef(String(data.pbsContactId || ''));
    if (contactRef) index.byContactRef.set(contactRef, docSnap.id);
  }

  return index;
}

function resolveCustomerIdByVehicle(
  index: CustomerIndex,
  keys: {
    vinLast8?: string;
    vin?: string;
    vehicleRef?: string;
  }
): string | undefined {
  if (keys.vinLast8) {
    const hit = index.byVinLast8.get(keys.vinLast8.toUpperCase());
    if (hit) return hit;
  }
  if (keys.vin) {
    const hit = index.byVin.get(keys.vin.toUpperCase());
    if (hit) return hit;
  }
  if (keys.vehicleRef) {
    const hit = index.byVehicleRef.get(normalizePbsRef(keys.vehicleRef));
    if (hit) return hit;
  }
  return undefined;
}

function resolveCustomerId(
  index: CustomerIndex,
  keys: {
    vinLast8?: string;
    vin?: string;
    phone?: string;
    vehicleRef?: string;
    contactRef?: string;
  }
): string | undefined {
  if (keys.vinLast8) {
    const hit = index.byVinLast8.get(keys.vinLast8.toUpperCase());
    if (hit) return hit;
  }
  if (keys.vin) {
    const hit = index.byVin.get(keys.vin.toUpperCase());
    if (hit) return hit;
  }
  if (keys.vehicleRef) {
    const hit = index.byVehicleRef.get(normalizePbsRef(keys.vehicleRef));
    if (hit) return hit;
  }
  if (keys.contactRef) {
    const hit = index.byContactRef.get(normalizePbsRef(keys.contactRef));
    if (hit) return hit;
  }
  if (keys.phone) {
    const hit = index.byPhone.get(keys.phone);
    if (hit) return hit;
  }
  return undefined;
}

function registerCustomerInIndex(
  index: CustomerIndex,
  docId: string,
  data: DocumentData
): void {
  index.dataById.set(docId, data);
  const vinLast8 = String(data.vinLast8 || '').toUpperCase();
  if (vinLast8) index.byVinLast8.set(vinLast8, docId);
  const vin = String(data.vin || '').toUpperCase();
  if (vin) index.byVin.set(vin, docId);
  const phone = normalizePhone(String(data.phone || ''));
  if (phone) index.byPhone.set(phone, docId);
  const vehicleRef = normalizePbsRef(String(data.pbsVehicleId || ''));
  if (vehicleRef) index.byVehicleRef.set(vehicleRef, docId);
  const contactRef = normalizePbsRef(String(data.pbsContactId || ''));
  if (contactRef) index.byContactRef.set(contactRef, docId);
}

async function fetchAllContactVehicles(
  watermark?: string
): Promise<PbsContactVehicle[]> {
  const criteria: Record<string, unknown> = {};
  if (watermark) {
    const since = toPbsPacificCriteriaIso(watermark);
    criteria.ContactModifiedSince = since;
    criteria.VehicleModifiedSince = since;
  }
  const response = await pbsContactVehicleGet(criteria);
  return pbsContactVehicleItems(response) as PbsContactVehicle[];
}

async function fetchRepairOrdersForSync(watermark?: string): Promise<PbsRepairOrder[]> {
  if (!watermark) {
    const response = await pbsRepairOrderGet({
      CashieredSince: yearsAgoPacificCriteria(REPAIR_ORDER_LOOKBACK_YEARS),
    });
    return (response.RepairOrders || []) as PbsRepairOrder[];
  }

  const since = toPbsPacificCriteriaIso(watermark);
  const [modifiedResponse, cashieredResponse, openedResponse] = await Promise.all([
    pbsRepairOrderGet({ ModifiedSince: since }),
    pbsRepairOrderGet({ CashieredSince: since }),
    pbsRepairOrderGet({ OpenDateSince: since }),
  ]);

  const merged = dedupeRepairOrders([
    ...((modifiedResponse.RepairOrders || []) as PbsRepairOrder[]),
    ...((cashieredResponse.RepairOrders || []) as PbsRepairOrder[]),
    ...((openedResponse.RepairOrders || []) as PbsRepairOrder[]),
  ]);

  return merged.filter((ro) => repairOrderChangedSince(ro, watermark));
}

async function fetchAppointmentsForSync(
  start: string,
  end: string,
  watermark?: string
): Promise<PbsAppointment[]> {
  const monthResponse = await pbsAppointmentGet(monthAppointmentCriteria(start, end));
  const monthAppointments = (monthResponse.Appointments || []) as PbsAppointment[];

  if (!watermark) {
    return monthAppointments;
  }

  const since = toPbsPacificCriteriaIso(watermark);
  const [modifiedResponse, sinceResponse] = await Promise.all([
    pbsAppointmentGet({ ModifiedSince: since }),
    pbsAppointmentGet({
      AppointmentSince: since,
      AppointmentUntil: `${end}T23:59:59.9999999-07:00`,
    }),
  ]);

  return dedupeAppointments([
    ...monthAppointments,
    ...((modifiedResponse.Appointments || []) as PbsAppointment[]),
    ...((sinceResponse.Appointments || []) as PbsAppointment[]),
  ]);
}

/** Optional — some PBS accounts return 401 for AppointmentContactVehicleInfoGet. */
async function fetchMonthAppointmentDisplayInfo(
  start: string,
  end: string,
  watermark?: string
): Promise<Map<string, PbsAppointmentDisplayInfo>> {
  try {
    const response = await pbsAppointmentContactVehicleInfoGet(
      monthAppointmentCriteria(start, end, watermark)
    );
    const items = (response.Items || []) as PbsAppointmentContactVehicleInfo[];
    return buildAppointmentDisplayInfoMap(items);
  } catch (err) {
    console.warn(
      '[PBS Sync] AppointmentContactVehicleInfoGet unavailable — schedule names will use the customer directory:',
      err instanceof Error ? err.message : err
    );
    return new Map();
  }
}

async function readPbsSyncState(
  db: Firestore,
  dealershipId: string
): Promise<PbsSyncState | null> {
  const snap = await dealershipSettingsDoc(db, dealershipId).get();
  if (!snap.exists) return null;
  const state = snap.data()?.pbsSyncState as PbsSyncState | undefined;
  return state ?? null;
}

async function writePbsSyncState(
  db: Firestore,
  dealershipId: string,
  state: PbsSyncState
): Promise<void> {
  await dealershipSettingsDoc(db, dealershipId).set(
    stripUndefinedDeep({
      id: dealershipId,
      pbsSyncState: state,
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
}

export const PBS_SYNC_STAGES = [
  'customers',
  'repair-orders',
  'appointments',
  'performance',
  'extended',
] as const;
export type PbsSyncStageName = (typeof PBS_SYNC_STAGES)[number];

export const PBS_SYNC_STAGE_LABELS: Record<PbsSyncStageName, string> = {
  customers: 'Customers & vehicles',
  'repair-orders': 'Repair orders & service visits',
  appointments: 'Appointments & day schedule',
  performance: 'Advisor & technician performance',
  extended: 'Reminders, inventory & dispatch',
};

interface PbsSyncStageContext {
  db: Firestore;
  dealershipId: string;
  startedAt: string;
  watermark?: string;
  counts: PbsSyncCounts;
  fetched: PbsSyncFetched;
  monthRange: { start: string; end: string };
}

async function stageCustomers(ctx: PbsSyncStageContext): Promise<void> {
  const { db, dealershipId, startedAt, watermark, counts, fetched } = ctx;
  const index = await loadCustomerIndex(db, dealershipId);
  const customerWrites: Array<(batch: WriteBatch) => void> = [];

  const contactVehiclesRaw = await fetchAllContactVehicles(watermark);
  const contactVehicles = dedupeContactVehiclesByVin(contactVehiclesRaw);
  fetched.contactVehicles = contactVehicles.length;
  console.log(
    `[PBS Sync] Contact vehicles fetched: ${contactVehiclesRaw.length} raw, ${contactVehicles.length} unique by VIN (${watermark ? 'incremental since ' + watermark : 'full fleet'})`
  );

  for (const cv of contactVehicles) {
    const mapped = mapContactVehicleToCustomerFields(cv, dealershipId);
    const vinLast8 = String(mapped.vinLast8 || '');
    if (!vinLast8) continue;

    const existingId = resolveCustomerIdByVehicle(index, {
      vinLast8,
      vin: String(mapped.vin || ''),
      vehicleRef: cv.VehicleId,
    });

    if (existingId) {
      const existing = index.dataById.get(existingId) || {};
      if (!customerBelongsToPbsSyncDealership(existing, dealershipId)) continue;

      const { patch, ownerChanged } = buildPbsCustomerUpdatePatch(existing, mapped, startedAt);
      if (ownerChanged) counts.ownerChanges += 1;

      const ref = customersCollection(db).doc(existingId);
      customerWrites.push((batch) => batch.set(ref, patch, { merge: true }));
      registerCustomerInIndex(index, existingId, { ...existing, ...patch });
      counts.customersUpdated += 1;
    } else {
      const ref = customersCollection(db).doc();
      const payload = stripUndefinedDeep({
        ...mapped,
        addedBy: 'pbs-sync',
        addedByUsername: 'PBS Sync',
        createdAt: Timestamp.now(),
        pbsSyncedAt: startedAt,
      });
      customerWrites.push((batch) => batch.set(ref, payload));
      registerCustomerInIndex(index, ref.id, payload);
      counts.customersCreated += 1;
    }
  }

  await commitBatches(db, customerWrites);
}

async function stageRepairOrders(ctx: PbsSyncStageContext): Promise<void> {
  const { db, dealershipId, startedAt, watermark, counts, fetched } = ctx;
  const index = await loadCustomerIndex(db, dealershipId);

  const repairOrders = await fetchRepairOrdersForSync(watermark);
  fetched.repairOrders = repairOrders.length;
  console.log(
    `[PBS Sync] Repair orders fetched: ${repairOrders.length} (${watermark ? 'incremental since ' + watermark : 'full 3-year window'})`
  );

  const visitsByCustomer = new Map<string, Array<Record<string, unknown>>>();
  for (const ro of repairOrders) {
    if (!shouldLogRepairOrderVisit(ro, watermark)) continue;

    const vehicleRef = (ro.VehicleRef || '').trim();
    if (!vehicleRef) continue;

    const visit = mapRepairOrderToVisit(ro);
    if (!visit) continue;

    const customerId = resolveCustomerIdByVehicle(index, { vehicleRef });
    if (!customerId) continue;

    const existing = index.dataById.get(customerId) || {};
    const customerVehicleRef = String(existing.pbsVehicleId || '').trim();
    if (customerVehicleRef && customerVehicleRef !== vehicleRef) continue;

    const list = visitsByCustomer.get(customerId) || [];
    list.push({
      id: `pbs-${visit.soNumber}`,
      soNumber: visit.soNumber,
      date: visit.date,
      mileage: visit.mileage,
      advisor: visit.advisor,
      requests: visit.requests,
      status: visit.status,
      lines: visit.lines,
      pbsVehicleRef: vehicleRef,
      pbsSyncedAt: startedAt,
      createdAt: Timestamp.now(),
    });
    counts.visitsLogged += 1;
    visitsByCustomer.set(customerId, list);
  }

  const visitWrites: Array<(batch: WriteBatch) => void> = [];
  for (const [customerId, incomingVisits] of visitsByCustomer) {
    const existing = index.dataById.get(customerId) || {};
    const vehicleRef = String(
      existing.pbsVehicleId || incomingVisits[0]?.pbsVehicleRef || ''
    ).trim();
    if (!vehicleRef) continue;

    const merged = mergeVehiclePbsServiceVisits(
      existing.recentVisits as Array<Record<string, unknown>> | undefined,
      incomingVisits,
      vehicleRef,
      MAX_RECENT_VISITS
    );
    if (merged.length === 0) continue;

    const latestDate = latestVisitDate(merged as Array<{ date?: string }>);
    const latestMileage = merged[0]?.mileage;
    const patch = stripUndefinedDeep({
      recentVisits: merged,
      pbsSyncedAt: startedAt,
      ...(latestDate ? { lastServiceDate: latestDate } : {}),
      ...(typeof latestMileage === 'number' && latestMileage > 0
        ? { mileage: String(latestMileage) }
        : {}),
    });

    const ref = customersCollection(db).doc(customerId);
    visitWrites.push((batch) => batch.set(ref, patch, { merge: true }));
    counts.visitsMerged += incomingVisits.length;
  }

  await commitBatches(db, visitWrites);
}

async function stageAppointments(ctx: PbsSyncStageContext): Promise<void> {
  const { db, dealershipId, startedAt, watermark, counts, fetched, monthRange } = ctx;
  const index = await loadCustomerIndex(db, dealershipId);

  const { start, end } = monthRange;
  const [appointments, appointmentDisplayInfo] = await Promise.all([
    fetchAppointmentsForSync(start, end, watermark),
    fetchMonthAppointmentDisplayInfo(start, end, watermark),
  ]);
  fetched.appointments = appointments.length;
  counts.appointmentsProcessed = appointments.length;
  console.log(`[PBS Sync] Appointments for ${start}..${end}: ${appointments.length}`);

  const dailyRows = aggregateAppointmentsByDay(appointments, start, end);
  const dailyByDate = new Map(dailyRows.map((row) => [row.date, row]));
  const trackerWrites: Array<(batch: WriteBatch) => void> = [];

  // Rewrite every calendar day in the active month so cancelled appointments zero out stale counts.
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const cursor = new Date(startYear, startMonth - 1, 1);
  const monthEnd = new Date(endYear, endMonth - 1, endDay);

  while (cursor <= monthEnd) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const row = dailyByDate.get(date);
    const breakdown = row?.breakdown ?? { diagnosis: 0, oilChange: 0, recall: 0, misc: 0 };
    const count = row?.count ?? 0;

    const docId = appointmentTrackerDocId(dealershipId, date);
    const ref = appointmentTrackerCollection(db).doc(docId);
    trackerWrites.push((batch) =>
      batch.set(
        ref,
        {
          date,
          count,
          dealershipId,
          breakdown,
          source: 'pbs',
          updatedAt: serverTimestamp(),
          updatedBy: 'pbs-sync',
          pbsSyncedAt: startedAt,
        },
        { merge: true }
      )
    );
    counts.appointmentDaysUpdated += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  await commitBatches(db, trackerWrites);

  const scheduleLookup = buildAppointmentCustomerLookup(index);
  try {
    const unresolvedRefs = collectUnresolvedContactRefs(
      appointments,
      scheduleLookup,
      appointmentDisplayInfo
    );
    const fallbackNames = await fetchContactNamesByRefs(unresolvedRefs);
    const displayInfoWithFallback = mergeContactNameFallback(
      appointments,
      fallbackNames,
      appointmentDisplayInfo
    );

    const scheduleResult = await syncAppointmentSchedule(
      db,
      dealershipId,
      appointments,
      start,
      end,
      scheduleLookup,
      startedAt,
      displayInfoWithFallback
    );
    counts.appointmentScheduleDays = scheduleResult.daysWritten;
    counts.appointmentScheduleSlots = scheduleResult.slotsWritten;
  } catch (scheduleErr) {
    const message = scheduleErr instanceof Error ? scheduleErr.message : String(scheduleErr);
    console.error('[PBS Sync] Appointment schedule failed:', scheduleErr);
    counts.appointmentScheduleError = message;
  }
}

async function stagePerformance(ctx: PbsSyncStageContext): Promise<void> {
  const { db, dealershipId, startedAt, counts, fetched, monthRange } = ctx;
  const { start: perfStart, end: perfEnd } = monthRange;
  fetched.performanceMonthStart = perfStart;
  fetched.performanceMonthEnd = perfEnd;

  try {
    const performance = await syncPbsAdvisorPerformance(db, dealershipId, perfStart, perfEnd, startedAt);
    counts.performanceAdvisors = performance.advisors;
    counts.performanceRepairOrders = performance.repairOrdersProcessed;
    counts.performancePartsInvoices = performance.partsInvoicesProcessed;
    fetched.performanceRepairOrders = performance.repairOrdersProcessed;
    fetched.performancePartsInvoices = performance.partsInvoicesProcessed;
    if (performance.partsInvoicesSkipped) {
      counts.performanceSyncWarning = `Parts invoices skipped (${performance.partsInvoicesSkipReason}). Labor/parts gross from RO lines only.`;
    }
  } catch (perfErr) {
    const message = perfErr instanceof Error ? perfErr.message : String(perfErr);
    console.error('[PBS Sync] Advisor performance failed:', perfErr);
    counts.performanceSyncError = message;
  }

  try {
    const technician = await syncPbsTechnicianPerformance(
      db,
      dealershipId,
      perfStart,
      perfEnd,
      startedAt
    );
    counts.technicianReports = technician.technicians;
    counts.timeClockActivities = technician.clockActivities;
    fetched.timeClockActivities = technician.clockActivities;
  } catch (techErr) {
    const message = techErr instanceof Error ? techErr.message : String(techErr);
    console.error('[PBS Sync] Technician performance failed:', techErr);
    counts.technicianSyncError = message;
  }
}

async function stageExtended(ctx: PbsSyncStageContext): Promise<void> {
  const { db, dealershipId, startedAt, counts, fetched } = ctx;
  const index = await loadCustomerIndex(db, dealershipId);

  try {
    const reminders = await syncPbsWorkplanReminders(
      db,
      dealershipId,
      toCustomerIndexMaps(index),
      startedAt
    );
    counts.workplanRemindersFetched = reminders.remindersFetched;
    counts.serviceRemindersUpdated = reminders.customersUpdated;
    fetched.workplanReminders = reminders.remindersFetched;

    const inventory = await syncPbsVehicleInventory(db, dealershipId, startedAt);
    counts.inventoryLots = inventory.lots;
    counts.inventoryVehiclesFetched = inventory.vehiclesFetched;
    counts.inventoryVehiclesWritten = inventory.vehiclesWritten;
    fetched.inventoryVehicles = inventory.vehiclesFetched;

    const dispatch = await syncPbsDispatchBoard(
      db,
      dealershipId,
      toCustomerIndexMaps(index),
      startedAt
    );
    counts.openRepairOrdersFetched = dispatch.openRepairOrdersFetched;
    counts.dispatchOrdersUpserted = dispatch.dispatchOrdersUpserted;
    counts.dispatchOrdersCompleted = dispatch.dispatchOrdersCompleted;
    fetched.openRepairOrders = dispatch.openRepairOrdersFetched;
  } catch (extendedErr) {
    const message = extendedErr instanceof Error ? extendedErr.message : String(extendedErr);
    console.error('[PBS Sync] Extended sync (reminders/inventory/dispatch) failed:', extendedErr);
    counts.extendedSyncError = message;
  }
}

const PBS_SYNC_STAGE_RUNNERS: Record<
  PbsSyncStageName,
  (ctx: PbsSyncStageContext) => Promise<void>
> = {
  customers: stageCustomers,
  'repair-orders': stageRepairOrders,
  appointments: stageAppointments,
  performance: stagePerformance,
  extended: stageExtended,
};

interface PbsSyncRunMeta {
  triggeredBy?: 'cron' | 'manual';
  triggeredByEmail?: string;
  triggeredByUsername?: string;
  fullRefresh?: boolean;
}

async function finalizePbsSyncRun(
  db: Firestore,
  dealershipId: string,
  startedAt: string,
  meta: PbsSyncRunMeta,
  counts: PbsSyncCounts,
  fetched: PbsSyncFetched,
  ok: boolean,
  error?: string
): Promise<PbsSyncResult> {
  const finishedAt = new Date().toISOString();
  const summary = buildPbsSyncSummary(ok, fetched, counts, error);
  const logEntry: PbsSyncLogEntry = {
    id: `pbs-${startedAt}`,
    startedAt,
    finishedAt,
    ok,
    triggeredBy: meta.triggeredBy || 'manual',
    triggeredByEmail: meta.triggeredByEmail,
    triggeredByUsername: meta.triggeredByUsername,
    fullRefresh: meta.fullRefresh,
    fetched,
    counts,
    error,
    summary,
  };

  const prior = await readPbsSyncState(db, dealershipId).catch(() => null);
  const state: PbsSyncState = {
    lastSyncAt: finishedAt,
    lastSuccessfulSyncAt: ok
      ? finishedAt
      : prior?.lastSuccessfulSyncAt ?? (prior?.lastSyncOk ? prior.lastSyncAt : undefined),
    lastSyncOk: ok,
    // Explicit null clears prior errors on success (merge would keep old values).
    lastError: error ?? null,
    counts,
    fetched,
    triggeredBy: meta.triggeredBy,
    triggeredByEmail: meta.triggeredByEmail,
    triggeredByUsername: meta.triggeredByUsername,
    summary,
    syncInProgress: false,
    stagedRun: null,
  };
  await writePbsSyncState(db, dealershipId, state).catch((writeErr) =>
    console.error('[PBS Sync] Failed to persist sync state', writeErr)
  );
  await appendPbsSyncLog(db, dealershipId, logEntry).catch((writeErr) =>
    console.error('[PBS Sync] Failed to persist sync log', writeErr)
  );

  return { ok, startedAt, finishedAt, counts, fetched, summary, error, logId: logEntry.id };
}

function plainFailure(
  startedAt: string,
  counts: PbsSyncCounts,
  fetched: PbsSyncFetched,
  error: string
): PbsSyncResult {
  return {
    ok: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    counts,
    fetched,
    summary: error,
    error,
  };
}

/** Refresh the lock heartbeat so long multi-stage runs are not treated as stale. */
async function touchPbsSyncLock(db: Firestore, dealershipId: string): Promise<void> {
  await dealershipSettingsDoc(db, dealershipId)
    .set(
      {
        pbsSyncState: { syncInProgress: true, syncStartedAt: new Date().toISOString() },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
    .catch((err) => console.error('[PBS Sync] Failed to refresh lock heartbeat', err));
}

export async function runPbsSync(options: RunPbsSyncOptions = {}): Promise<PbsSyncResult> {
  const startedAt = new Date().toISOString();
  const counts = emptyCounts();
  const monthRange = monthRangePacific();
  const fetched = emptyFetched(monthRange.start, monthRange.end);
  const dealershipId = PBS_AUTOMATED_SYNC_DEALERSHIP_ID;
  const meta: PbsSyncRunMeta = {
    triggeredBy: options.triggeredBy,
    triggeredByEmail: options.triggeredByEmail,
    triggeredByUsername: options.triggeredByUsername,
    fullRefresh: options.fullRefresh,
  };

  if (options.dealershipId && !resolvePbsAutomatedSyncDealershipId(options.dealershipId)) {
    return plainFailure(startedAt, counts, fetched, pbsAutomatedSyncScopeError(options.dealershipId));
  }

  if (!isPbsPartnerHubConfigured()) {
    return plainFailure(
      startedAt,
      counts,
      fetched,
      'PBS PartnerHUB credentials are not configured on the server.'
    );
  }

  const db = getAdminFirestore();
  if (!db) {
    return plainFailure(
      startedAt,
      counts,
      fetched,
      'FIREBASE_SERVICE_ACCOUNT_JSON is not configured — server-side PBS sync cannot write to Firestore.'
    );
  }

  const priorState = await readPbsSyncState(db, dealershipId);

  if (
    priorState?.syncInProgress &&
    priorState.syncStartedAt &&
    !options.force &&
    !isPbsSyncStateStale(priorState)
  ) {
    return plainFailure(startedAt, counts, fetched, 'A PBS sync is already running.');
  }

  await writePbsSyncState(db, dealershipId, {
    lastSyncAt: priorState?.lastSyncAt ?? startedAt,
    lastSuccessfulSyncAt: priorState?.lastSuccessfulSyncAt,
    lastSyncOk: priorState?.lastSyncOk ?? false,
    lastError: priorState?.lastError,
    counts: priorState?.counts,
    fetched: priorState?.fetched,
    summary: priorState?.summary,
    triggeredBy: options.triggeredBy || priorState?.triggeredBy,
    triggeredByEmail: options.triggeredByEmail ?? priorState?.triggeredByEmail,
    triggeredByUsername: options.triggeredByUsername ?? priorState?.triggeredByUsername,
    syncInProgress: true,
    syncStartedAt: startedAt,
  });

  const watermark = resolveIncrementalWatermark(priorState, Boolean(options.fullRefresh));
  if (watermark) {
    fetched.incrementalSince = watermark;
  }

  const ctx: PbsSyncStageContext = {
    db,
    dealershipId,
    startedAt,
    watermark,
    counts,
    fetched,
    monthRange,
  };

  try {
    for (const stage of PBS_SYNC_STAGES) {
      await PBS_SYNC_STAGE_RUNNERS[stage](ctx);
      await touchPbsSyncLock(db, dealershipId);
    }
    return finalizePbsSyncRun(db, dealershipId, startedAt, meta, counts, fetched, true);
  } catch (err) {
    const message =
      err instanceof PbsPartnerHubError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'PBS sync failed';

    console.error('[PBS Sync]', err);
    return finalizePbsSyncRun(db, dealershipId, startedAt, meta, counts, fetched, false, message);
  }
}

export interface StartStagedPbsSyncResult {
  ok: boolean;
  startedAt?: string;
  nextStage?: PbsSyncStageName;
  totalStages?: number;
  inProgress?: boolean;
  busyStartedAt?: string;
  error?: string;
}

/** Begin a staged sync — each stage runs in its own short HTTP request. */
export async function startStagedPbsSync(
  options: RunPbsSyncOptions = {}
): Promise<StartStagedPbsSyncResult> {
  const startedAt = new Date().toISOString();

  if (options.dealershipId && !resolvePbsAutomatedSyncDealershipId(options.dealershipId)) {
    return { ok: false, error: pbsAutomatedSyncScopeError(options.dealershipId) };
  }

  if (!isPbsPartnerHubConfigured()) {
    return { ok: false, error: 'PBS PartnerHUB credentials are not configured on the server.' };
  }

  const db = getAdminFirestore();
  if (!db) {
    return {
      ok: false,
      error:
        'FIREBASE_SERVICE_ACCOUNT_JSON is not configured — server-side PBS sync cannot write to Firestore.',
    };
  }

  const dealershipId = PBS_AUTOMATED_SYNC_DEALERSHIP_ID;
  const priorState = await readPbsSyncState(db, dealershipId);

  if (
    priorState?.syncInProgress &&
    priorState.syncStartedAt &&
    !options.force &&
    !isPbsSyncStateStale(priorState)
  ) {
    return {
      ok: false,
      inProgress: true,
      busyStartedAt: priorState.syncStartedAt,
      error: 'A PBS sync is already running.',
    };
  }

  const monthRange = monthRangePacific();
  const fetched = emptyFetched(monthRange.start, monthRange.end);
  const watermark = resolveIncrementalWatermark(priorState, Boolean(options.fullRefresh));
  if (watermark) {
    fetched.incrementalSince = watermark;
  }

  await writePbsSyncState(db, dealershipId, {
    lastSyncAt: priorState?.lastSyncAt ?? startedAt,
    lastSuccessfulSyncAt: priorState?.lastSuccessfulSyncAt,
    lastSyncOk: priorState?.lastSyncOk ?? false,
    lastError: priorState?.lastError,
    counts: priorState?.counts,
    fetched: priorState?.fetched,
    summary: priorState?.summary,
    triggeredBy: options.triggeredBy || 'manual',
    triggeredByEmail: options.triggeredByEmail,
    triggeredByUsername: options.triggeredByUsername,
    syncInProgress: true,
    syncStartedAt: startedAt,
    stagedRun: {
      runId: startedAt,
      watermark,
      fullRefresh: options.fullRefresh === true,
      triggeredBy: options.triggeredBy || 'manual',
      triggeredByEmail: options.triggeredByEmail,
      triggeredByUsername: options.triggeredByUsername,
      completedStages: [],
      counts: emptyCounts(),
      fetched,
    },
  });

  return {
    ok: true,
    startedAt,
    nextStage: PBS_SYNC_STAGES[0],
    totalStages: PBS_SYNC_STAGES.length,
  };
}

export interface ExecutePbsSyncStageResult {
  ok: boolean;
  done?: boolean;
  nextStage?: PbsSyncStageName;
  stageIndex?: number;
  totalStages?: number;
  result?: PbsSyncResult;
  error?: string;
}

/** Execute one stage of a staged sync run and persist progress. */
export async function executePbsSyncStage(
  runId: string,
  stage: PbsSyncStageName
): Promise<ExecutePbsSyncStageResult> {
  const db = getAdminFirestore();
  if (!db) {
    return { ok: false, error: 'Firestore admin is not configured.' };
  }

  const dealershipId = PBS_AUTOMATED_SYNC_DEALERSHIP_ID;
  const state = await readPbsSyncState(db, dealershipId);
  const run = state?.stagedRun;

  if (!run || run.runId !== runId) {
    return {
      ok: false,
      error: 'This sync run is no longer active — it may have been superseded. Start a new pull.',
    };
  }

  if (!PBS_SYNC_STAGES.includes(stage)) {
    return { ok: false, error: `Unknown sync stage: ${stage}` };
  }

  if (run.completedStages.includes(stage)) {
    // Idempotent retry — report the next pending stage.
    const pending = PBS_SYNC_STAGES.find((s) => !run.completedStages.includes(s));
    return pending
      ? { ok: true, nextStage: pending, totalStages: PBS_SYNC_STAGES.length }
      : { ok: true, done: true };
  }

  const counts = { ...emptyCounts(), ...run.counts };
  const monthStart = run.fetched.appointmentMonthStart || monthRangePacific().start;
  const monthEnd = run.fetched.appointmentMonthEnd || monthRangePacific().end;
  const fetched: PbsSyncFetched = { ...emptyFetched(monthStart, monthEnd), ...run.fetched };
  const meta: PbsSyncRunMeta = {
    triggeredBy: run.triggeredBy,
    triggeredByEmail: run.triggeredByEmail,
    triggeredByUsername: run.triggeredByUsername,
    fullRefresh: run.fullRefresh,
  };

  const ctx: PbsSyncStageContext = {
    db,
    dealershipId,
    startedAt: runId,
    watermark: run.watermark,
    counts,
    fetched,
    monthRange: { start: monthStart, end: monthEnd },
  };

  try {
    await PBS_SYNC_STAGE_RUNNERS[stage](ctx);
  } catch (err) {
    const message =
      err instanceof PbsPartnerHubError
        ? err.message
        : err instanceof Error
          ? err.message
          : `PBS sync failed during ${stage}`;
    console.error(`[PBS Sync] Stage ${stage} failed:`, err);
    const result = await finalizePbsSyncRun(
      db,
      dealershipId,
      runId,
      meta,
      counts,
      fetched,
      false,
      message
    );
    return { ok: false, error: message, result };
  }

  const completedStages = [...run.completedStages, stage];
  const nextStage = PBS_SYNC_STAGES.find((s) => !completedStages.includes(s));

  if (!nextStage) {
    const result = await finalizePbsSyncRun(db, dealershipId, runId, meta, counts, fetched, true);
    return { ok: true, done: true, result };
  }

  await writePbsSyncState(db, dealershipId, {
    ...(state as PbsSyncState),
    syncInProgress: true,
    syncStartedAt: new Date().toISOString(),
    stagedRun: {
      ...run,
      completedStages,
      counts,
      fetched,
    },
  });

  return {
    ok: true,
    nextStage,
    stageIndex: PBS_SYNC_STAGES.indexOf(nextStage) + 1,
    totalStages: PBS_SYNC_STAGES.length,
  };
}

export function isPacificMorningSyncHour(reference = new Date()): boolean {
  const hour = Number(
    reference.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    })
  );
  return hour === 6;
}

/**
 * @deprecated Netlify serverless cannot continue work after the HTTP response.
 * Callers should await runPbsSync() directly instead.
 */
export async function startPbsSyncBackground(
  options: RunPbsSyncOptions = {}
): Promise<PbsSyncStartResult> {
  const result = await runPbsSync(options);
  return {
    accepted: result.ok,
    startedAt: result.startedAt,
    message: result.summary,
    inProgress: false,
  };
}

export async function clearStalePbsSyncInProgress(
  db: Firestore,
  dealershipId: string
): Promise<boolean> {
  const priorState = await readPbsSyncState(db, dealershipId);
  if (!priorState?.syncInProgress || !isPbsSyncStateStale(priorState)) {
    return false;
  }

  await writePbsSyncState(db, dealershipId, {
    ...priorState,
    syncInProgress: false,
    lastError: priorState.lastError || 'Previous PBS sync did not finish — stale lock cleared.',
  });
  return true;
}
