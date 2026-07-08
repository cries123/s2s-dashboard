import { Timestamp, type DocumentData, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../admin/initFirebaseAdmin.js';
import {
  pbsAppointmentGet,
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
  normalizePhone,
} from './pbsMappers.js';
import {
  appointmentTrackerCollection,
  appointmentTrackerDocId,
  commitBatches,
  customersCollection,
  dealershipSettingsDoc,
  PBS_DEALERSHIP_ID,
  serverTimestamp,
} from './pbsFirestore.js';
import type {
  PbsAppointment,
  PbsContactVehicle,
  PbsRepairOrder,
  PbsSyncCounts,
  PbsSyncResult,
  PbsSyncState,
} from './pbsTypes.js';

const MAX_RECENT_VISITS = 25;
const REPAIR_ORDER_LOOKBACK_YEARS = 3;

export interface RunPbsSyncOptions {
  dealershipId?: string;
  triggeredBy?: 'cron' | 'manual';
  /** When true, ignore ModifiedSince watermarks and pull full customer + RO history windows. */
  fullRefresh?: boolean;
}

interface CustomerIndex {
  byVinLast8: Map<string, string>;
  byVin: Map<string, string>;
  byPhone: Map<string, string>;
  byVehicleRef: Map<string, string>;
  byContactRef: Map<string, string>;
  dataById: Map<string, DocumentData>;
}

function emptyCounts(): PbsSyncCounts {
  return {
    customersCreated: 0,
    customersUpdated: 0,
    visitsMerged: 0,
    appointmentDaysUpdated: 0,
    appointmentsProcessed: 0,
  };
}

function yearsAgoIso(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString();
}

function monthRangePacific(reference = new Date()): { start: string; end: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const monthStr = String(month + 1).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    start: `${year}-${monthStr}-01`,
    end: `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

function monthAppointmentCriteria(start: string, end: string): Record<string, unknown> {
  return {
    AppointmentSince: `${start}T00:00:00.0000000-07:00`,
    AppointmentUntil: `${end}T23:59:59.9999999-07:00`,
  };
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
    const owner = (data.dealershipId as string | undefined) || 'hyundai';
    if (owner !== dealershipId) continue;

    index.dataById.set(docSnap.id, data);

    const vinLast8 = String(data.vinLast8 || '').toUpperCase();
    if (vinLast8) index.byVinLast8.set(vinLast8, docSnap.id);

    const vin = String(data.vin || '').toUpperCase();
    if (vin) index.byVin.set(vin, docSnap.id);

    const phone = normalizePhone(String(data.phone || ''));
    if (phone) index.byPhone.set(phone, docSnap.id);

    const vehicleRef = String(data.pbsVehicleId || '');
    if (vehicleRef) index.byVehicleRef.set(vehicleRef, docSnap.id);

    const contactRef = String(data.pbsContactId || '');
    if (contactRef) index.byContactRef.set(contactRef, docSnap.id);
  }

  return index;
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
    const hit = index.byVehicleRef.get(keys.vehicleRef);
    if (hit) return hit;
  }
  if (keys.contactRef) {
    const hit = index.byContactRef.get(keys.contactRef);
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
  const vehicleRef = String(data.pbsVehicleId || '');
  if (vehicleRef) index.byVehicleRef.set(vehicleRef, docId);
  const contactRef = String(data.pbsContactId || '');
  if (contactRef) index.byContactRef.set(contactRef, docId);
}

async function fetchAllContactVehicles(
  modifiedSince?: string
): Promise<PbsContactVehicle[]> {
  const criteria: Record<string, unknown> = {};
  if (modifiedSince) {
    criteria.ContactModifiedSince = modifiedSince;
    criteria.VehicleModifiedSince = modifiedSince;
  }
  const response = await pbsContactVehicleGet(criteria);
  return pbsContactVehicleItems(response) as PbsContactVehicle[];
}

async function fetchRepairOrders(modifiedSince?: string): Promise<PbsRepairOrder[]> {
  const criteria: Record<string, unknown> = {
    CashieredSince: yearsAgoIso(REPAIR_ORDER_LOOKBACK_YEARS),
  };
  if (modifiedSince) {
    criteria.ModifiedSince = modifiedSince;
  }
  const response = await pbsRepairOrderGet(criteria);
  return (response.RepairOrders || []) as PbsRepairOrder[];
}

async function fetchMonthAppointments(start: string, end: string): Promise<PbsAppointment[]> {
  const response = await pbsAppointmentGet(monthAppointmentCriteria(start, end));
  return (response.Appointments || []) as PbsAppointment[];
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
    {
      id: dealershipId,
      pbsSyncState: state,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function runPbsSync(options: RunPbsSyncOptions = {}): Promise<PbsSyncResult> {
  const startedAt = new Date().toISOString();
  const dealershipId = options.dealershipId || PBS_DEALERSHIP_ID;
  const counts = emptyCounts();

  if (!isPbsPartnerHubConfigured()) {
    return {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      counts,
      error: 'PBS PartnerHUB credentials are not configured on the server.',
    };
  }

  const db = getAdminFirestore();
  if (!db) {
    return {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      counts,
      error:
        'FIREBASE_SERVICE_ACCOUNT_JSON is not configured — server-side PBS sync cannot write to Firestore.',
    };
  }

  const priorState = await readPbsSyncState(db, dealershipId);
  const modifiedSince =
    options.fullRefresh || !priorState?.lastSyncOk
      ? undefined
      : priorState.lastSyncAt;

  try {
    const index = await loadCustomerIndex(db, dealershipId);
    const customerWrites: Array<(batch: WriteBatch) => void> = [];

    const contactVehicles = await fetchAllContactVehicles(modifiedSince);
    console.log(`[PBS Sync] Contact vehicles fetched: ${contactVehicles.length}`);

    for (const cv of contactVehicles) {
      const mapped = mapContactVehicleToCustomerFields(cv, dealershipId);
      const vinLast8 = String(mapped.vinLast8 || '');
      if (!vinLast8) continue;

      const existingId = resolveCustomerId(index, {
        vinLast8,
        vin: String(mapped.vin || ''),
        phone: normalizePhone(String(mapped.phone || '')),
        vehicleRef: cv.VehicleId,
        contactRef: cv.ContactId,
      });

      if (existingId) {
        const existing = index.dataById.get(existingId) || {};
        const patch: Record<string, unknown> = {
          ...mapped,
          enableServiceAlert: existing.enableServiceAlert ?? mapped.enableServiceAlert,
          serviceAlertTriggered: existing.serviceAlertTriggered ?? false,
          serviceReminderDueDate: existing.serviceReminderDueDate,
          serviceAlertIntervalDays: existing.serviceAlertIntervalDays,
          serviceAlertBufferDays: existing.serviceAlertBufferDays,
          serviceAlertOverrideDate: existing.serviceAlertOverrideDate,
          stopAlertInfo: existing.stopAlertInfo,
          notes: existing.notes,
          soldByUserId: existing.soldByUserId,
          soldByUsername: existing.soldByUsername,
          lastContactOutcome: existing.lastContactOutcome,
          lastContactUserId: existing.lastContactUserId,
          lastContactUsername: existing.lastContactUsername,
          lastAcknowledgedCycle: existing.lastAcknowledgedCycle ?? 0,
          addedBy: existing.addedBy,
          addedByUsername: existing.addedByUsername,
          createdAt: existing.createdAt,
          pbsSyncedAt: startedAt,
        };

        const ref = customersCollection(db).doc(existingId);
        customerWrites.push((batch) => batch.set(ref, patch, { merge: true }));
        registerCustomerInIndex(index, existingId, { ...existing, ...patch });
        counts.customersUpdated += 1;
      } else {
        const ref = customersCollection(db).doc();
        const payload = {
          ...mapped,
          addedBy: 'pbs-sync',
          addedByUsername: 'PBS Sync',
          createdAt: Timestamp.now(),
          pbsSyncedAt: startedAt,
        };
        customerWrites.push((batch) => batch.set(ref, payload));
        registerCustomerInIndex(index, ref.id, payload);
        counts.customersCreated += 1;
      }
    }

    await commitBatches(db, customerWrites);

    const repairOrders = await fetchRepairOrders(modifiedSince);
    console.log(`[PBS Sync] Repair orders fetched: ${repairOrders.length}`);

    const visitsByCustomer = new Map<string, Array<Record<string, unknown>>>();
    for (const ro of repairOrders) {
      const visit = mapRepairOrderToVisit(ro);
      if (!visit) continue;

      const customerId = resolveCustomerId(index, {
        vehicleRef: ro.VehicleRef,
        contactRef: ro.ContactRef,
      });
      if (!customerId) continue;

      const list = visitsByCustomer.get(customerId) || [];
      list.push({
        id: `pbs-${visit.soNumber}`,
        soNumber: visit.soNumber,
        date: visit.date,
        mileage: visit.mileage,
        advisor: visit.advisor,
        requests: visit.requests,
        createdAt: Timestamp.now(),
      });
      visitsByCustomer.set(customerId, list);
    }

    const visitWrites: Array<(batch: WriteBatch) => void> = [];
    for (const [customerId, incomingVisits] of visitsByCustomer) {
      const existing = index.dataById.get(customerId) || {};
      const merged = mergeServiceVisits(
        existing.recentVisits as Array<Record<string, unknown>> | undefined,
        incomingVisits,
        MAX_RECENT_VISITS
      );
      if (merged.length === 0) continue;

      const latestDate = latestVisitDate(merged as Array<{ date?: string }>);
      const latestMileage = merged[0]?.mileage;
      const patch: Record<string, unknown> = {
        recentVisits: merged,
        pbsSyncedAt: startedAt,
      };
      if (latestDate) patch.lastServiceDate = latestDate;
      if (typeof latestMileage === 'number' && latestMileage > 0) {
        patch.mileage = String(latestMileage);
      }

      const ref = customersCollection(db).doc(customerId);
      visitWrites.push((batch) => batch.set(ref, patch, { merge: true }));
      counts.visitsMerged += incomingVisits.length;
    }

    await commitBatches(db, visitWrites);

    const { start, end } = monthRangePacific();
    const appointments = await fetchMonthAppointments(start, end);
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

    const finishedAt = new Date().toISOString();
    const state: PbsSyncState = {
      lastSyncAt: finishedAt,
      lastSyncOk: true,
      counts,
      triggeredBy: options.triggeredBy,
    };
    await writePbsSyncState(db, dealershipId, state);

    return { ok: true, startedAt, finishedAt, counts };
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const message =
      err instanceof PbsPartnerHubError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'PBS sync failed';

    console.error('[PBS Sync]', err);

    await writePbsSyncState(db, dealershipId, {
      lastSyncAt: finishedAt,
      lastSyncOk: false,
      lastError: message,
      counts,
      triggeredBy: options.triggeredBy,
    }).catch((writeErr) => console.error('[PBS Sync] Failed to persist error state', writeErr));

    return { ok: false, startedAt, finishedAt, counts, error: message };
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
  return hour === 8;
}
