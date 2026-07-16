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

export async function runPbsSync(options: RunPbsSyncOptions = {}): Promise<PbsSyncResult> {
  const startedAt = new Date().toISOString();
  if (options.dealershipId && !resolvePbsAutomatedSyncDealershipId(options.dealershipId)) {
    const counts = emptyCounts();
    const monthRange = monthRangePacific();
    const fetched = emptyFetched(monthRange.start, monthRange.end);
    const finishedAt = new Date().toISOString();
    const error = pbsAutomatedSyncScopeError(options.dealershipId);
    return {
      ok: false,
      startedAt,
      finishedAt,
      counts,
      fetched,
      summary: error,
      error,
    };
  }

  const dealershipId = PBS_AUTOMATED_SYNC_DEALERSHIP_ID;
  const counts = emptyCounts();
  const monthRange = monthRangePacific();
  const fetched = emptyFetched(monthRange.start, monthRange.end);
  const logId = `pbs-${startedAt}`;

  const finish = async (
    ok: boolean,
    error?: string,
    partialCounts = counts,
    partialFetched = fetched
  ): Promise<PbsSyncResult> => {
    const finishedAt = new Date().toISOString();
    const summary = buildPbsSyncSummary(ok, partialFetched, partialCounts, error);
    const logEntry: PbsSyncLogEntry = {
      id: logId,
      startedAt,
      finishedAt,
      ok,
      triggeredBy: options.triggeredBy || 'manual',
      triggeredByEmail: options.triggeredByEmail,
      triggeredByUsername: options.triggeredByUsername,
      fullRefresh: options.fullRefresh,
      fetched: partialFetched,
      counts: partialCounts,
      error,
      summary,
    };

    const db = getAdminFirestore();
    if (db) {
      const state: PbsSyncState = {
        lastSyncAt: finishedAt,
        lastSuccessfulSyncAt: ok
          ? finishedAt
          : priorState?.lastSuccessfulSyncAt ??
            (priorState?.lastSyncOk ? priorState.lastSyncAt : undefined),
        lastSyncOk: ok,
        lastError: error,
        counts: partialCounts,
        fetched: partialFetched,
        triggeredBy: options.triggeredBy,
        triggeredByEmail: options.triggeredByEmail,
        triggeredByUsername: options.triggeredByUsername,
        summary,
        syncInProgress: false,
      };
      await writePbsSyncState(db, dealershipId, state).catch((writeErr) =>
        console.error('[PBS Sync] Failed to persist sync state', writeErr)
      );
      await appendPbsSyncLog(db, dealershipId, logEntry).catch((writeErr) =>
        console.error('[PBS Sync] Failed to persist sync log', writeErr)
      );
    }

    return {
      ok,
      startedAt,
      finishedAt,
      counts: partialCounts,
      fetched: partialFetched,
      summary,
      error,
      logId,
    };
  };

  if (!isPbsPartnerHubConfigured()) {
    return finish(false, 'PBS PartnerHUB credentials are not configured on the server.');
  }

  const db = getAdminFirestore();
  if (!db) {
    return finish(
      false,
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
    return {
      ok: false,
      startedAt: priorState.syncStartedAt,
      finishedAt: new Date().toISOString(),
      counts,
      fetched,
      summary: 'A PBS sync is already running. Wait for it to finish or try again in a few minutes.',
      error: 'A PBS sync is already running.',
    };
  }

  if (priorState?.syncInProgress && isPbsSyncStateStale(priorState)) {
    console.warn('[PBS Sync] Clearing stale syncInProgress flag before starting a new sync.');
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

  try {
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

    return finish(true);
  } catch (err) {
    const message =
      err instanceof PbsPartnerHubError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'PBS sync failed';

    console.error('[PBS Sync]', err);
    return finish(false, message);
  }
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
