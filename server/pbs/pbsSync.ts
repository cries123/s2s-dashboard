import { FieldValue, Timestamp, type DocumentData, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
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
  mapContactVehicleToCustomerFields,
  mapRepairOrderToVisit,
  normalizePhone,
  pbsAppointmentPacificDate,
  pbsIsoToDateString,
} from './pbsMappers.js';
import {
  mergeIntoSummary,
  refreshSummaryFromEmbedded,
  SERVICE_VISITS_COLLECTION,
  type StoredVisit,
  type VisitSummary,
} from '../../src/lib/visitStore.js';
import {
  planVehicleProfiles,
  type ProfileCandidate,
  type RepairOrderVehicle,
  type VehicleFacts,
  type VehicleProfilePlan,
} from './pbsVehicleProfilePlan.js';
import { fetchVehicleOwnerRecords } from './pbsContactVehicleFallback.js';
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
  appointmentArrivalKey,
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
  isOpenRepairOrder,
  repairOrderChangedSince,
  resolveIncrementalWatermark,
  shouldLogRepairOrderVisit,
  shouldRecordRepairOrder,
  toPbsPacificCriteriaIso,
} from './pbsIncrementalCriteria.js';

const REPAIR_ORDER_LOOKBACK_YEARS = 3;
/** How far back an open repair order is looked for — matches the open-RO board. */
const OPEN_REPAIR_ORDER_LOOKBACK_DAYS = 90;

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
  // Scope the index to the store being synced. This previously read every
  // store every run (hourly), which is both wasted reads and a needless
  // cross-store data pull.
  const snap = await customersCollection(db)
    .where('dealershipId', '==', dealershipId)
    .get();
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
    // Folded into another profile (vinDuplicateMerge): its car lives there now.
    if (data.mergedInto) continue;

    // Same keys as a profile registered mid-run, including every PBS record
    // for its car — a merged car carries the other profile's in pbsVehicleRefs.
    registerCustomerInIndex(index, docSnap.id, data);
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
  // A profile can be tied to more than one PBS record for its car.
  for (const ref of vehicleRefsOf(data)) {
    const vehicleRef = normalizePbsRef(ref);
    if (vehicleRef) index.byVehicleRef.set(vehicleRef, docId);
  }
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

/**
 * Months per full-history window.
 *
 * Six months was too much: the first window of a full refresh asked PBS for
 * roughly half a year of cashiered repair orders with every labour and part
 * line, then wrote them all, and the request was cut off at the gateway before
 * it finished. The whole point of windowing is that one window fits in one
 * request, so a window is now a single month — 36 short requests across three
 * years rather than 6 long ones.
 */
const RO_HISTORY_WINDOW_MONTHS = 1;

export interface RoHistoryWindow {
  sinceIso: string;
  untilIso: string;
  index: number;
  total: number;
}

/** Split the 3-year full history into windows so each request stays fast. */
export function buildRoHistoryWindows(reference = new Date()): RoHistoryWindow[] {
  const windows: RoHistoryWindow[] = [];
  const totalMonths = REPAIR_ORDER_LOOKBACK_YEARS * 12;
  const total = Math.ceil(totalMonths / RO_HISTORY_WINDOW_MONTHS);

  for (let i = 0; i < total; i += 1) {
    const since = new Date(reference);
    since.setMonth(since.getMonth() - Math.min(totalMonths, (i + 1) * RO_HISTORY_WINDOW_MONTHS));
    const until = new Date(reference);
    until.setMonth(until.getMonth() - i * RO_HISTORY_WINDOW_MONTHS);
    windows.push({
      sinceIso: since.toISOString(),
      untilIso: until.toISOString(),
      index: i,
      total,
    });
  }

  return windows;
}

async function fetchRepairOrdersHistoryWindow(window: RoHistoryWindow): Promise<PbsRepairOrder[]> {
  const response = await pbsRepairOrderGet({
    CashieredSince: toPbsPacificCriteriaIso(window.sinceIso),
    CashieredUntil: toPbsPacificCriteriaIso(window.untilIso),
  });
  return (response.RepairOrders || []) as PbsRepairOrder[];
}

async function fetchRepairOrdersIncremental(watermark: string): Promise<PbsRepairOrder[]> {
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
  /** Resume point for chunked stages (e.g. RO history window index). */
  stageCursor?: string;
}

/** Chunked stages return moreWork+cursor so each HTTP request stays short. */
type PbsSyncStageOutcome = { moreWork?: false } | { moreWork: true; cursor: string; detail?: string };

async function stageCustomers(ctx: PbsSyncStageContext): Promise<PbsSyncStageOutcome> {
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
  return {};
}

/** Every PBS vehicle record a profile is tied to. */
function vehicleRefsOf(d: DocumentData): string[] {
  const refs = [d.pbsVehicleId, ...(Array.isArray(d.pbsVehicleRefs) ? d.pbsVehicleRefs : [])]
    .map((r) => String(r || '').trim())
    .filter(Boolean);
  return [...new Set(refs)];
}

function isoOf(value: unknown): string | undefined {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === 'string' ? value : undefined;
}

/** The profiles in an index, in the shape the profile planner reads. */
function profileCandidatesFrom(index: CustomerIndex): ProfileCandidate[] {
  return [...index.dataById.entries()].map(([id, d]) => ({
    id,
    vinLast8: String(d.vinLast8 || ''),
    vin: d.vin ? String(d.vin) : undefined,
    make: d.make ? String(d.make) : undefined,
    vehicleRefs: vehicleRefsOf(d),
    visitCount: Array.isArray(d.recentVisits)
      ? d.recentVisits.length
      : Array.isArray(d.visitSummary?.entries)
        ? d.visitSummary.entries.length
        : 0,
    createdAt: isoOf(d.createdAt),
  }));
}

function vehiclesOn(repairOrders: readonly PbsRepairOrder[]): RepairOrderVehicle[] {
  return repairOrders
    .map((ro) => ({
      vehicleRef: String(ro.VehicleRef || '').trim(),
      contactRef: String(ro.ContactRef || '').trim() || undefined,
    }))
    .filter((v) => v.vehicleRef);
}

const CONTACT_FIELDS = [
  'ContactId', 'ContactFirstName', 'ContactLastName', 'ContactMiddleName', 'ContactAddress',
  'ContactCity', 'ContactState', 'ContactZipCode', 'ContactBusinessPhone', 'ContactHomePhone',
  'ContactCellPhone', 'ContactEmailAddress',
] as const;

/**
 * The owner record for a new profile: the person on the repair order. PBS may
 * list past owners against the same car, so the row pairing this car with the
 * repair order's contact wins; failing that, that contact's details are laid
 * over the car's most recently updated row.
 */
function ownerRowFor(
  vehicleRef: string,
  contactRef: string | undefined,
  rowsByVehicle: Map<string, PbsContactVehicle[]>,
  rowsByContact: Map<string, PbsContactVehicle[]>
): PbsContactVehicle {
  const vKey = normalizePbsRef(vehicleRef);
  const cKey = normalizePbsRef(contactRef || '');
  const rows = rowsByVehicle.get(vKey) ?? [];
  const exact = cKey ? rows.find((r) => normalizePbsRef(String(r.ContactId || '')) === cKey) : undefined;
  if (exact) return exact;
  const latest = [...rows].sort((a, b) =>
    String(b.ContactLastUpdate || b.VehicleLastUpdate || '').localeCompare(String(a.ContactLastUpdate || a.VehicleLastUpdate || ''))
  )[0];
  const contactRow = cKey ? (rowsByContact.get(cKey) ?? [])[0] : undefined;
  const merged: PbsContactVehicle = { ...(latest ?? {}), VehicleId: vehicleRef };
  if (contactRow) for (const f of CONTACT_FIELDS) (merged as Record<string, unknown>)[f] = contactRow[f];
  return merged;
}

export interface PlacementResult {
  plan: VehicleProfilePlan;
  /** Real ids of profiles created, keyed by the plan's temp id. */
  created: Map<string, string>;
  /** Owner name per created profile, for the preview. */
  owners: Map<string, string>;
}

/**
 * Give every vehicle a set of repair orders names a profile: tie it to the
 * profile for its VIN, or create one. Duplicate profiles of one car are flagged,
 * never removed. With `dryRun`, plans and names everything and writes nothing.
 */
async function placeRepairOrderVehicles(
  db: Firestore,
  index: CustomerIndex,
  dealershipId: string,
  repairOrders: readonly PbsRepairOrder[],
  startedAt: string,
  options: { dryRun?: boolean } = {}
): Promise<PlacementResult> {
  const vehicles = vehiclesOn(repairOrders);
  const { rowsByVehicle, rowsByContact, facts: display } = await fetchVehicleOwnerRecords(
    [...new Set(vehicles.map((v) => v.vehicleRef))],
    [...new Set(vehicles.map((v) => v.contactRef).filter((c): c is string => Boolean(c)))]
  );
  const facts = new Map<string, VehicleFacts>();
  for (const [key, info] of display) facts.set(key, { vin: info.vin, make: info.make });

  const plan = planVehicleProfiles(vehicles, facts, profileCandidatesFrom(index));
  const created = new Map<string, string>();
  const owners = new Map<string, string>();

  // New profiles, built the same way the customer sync builds them.
  const newProfiles = new Map<string, Record<string, unknown>>();
  for (const c of plan.creates) {
    const row = ownerRowFor(c.vehicleRef, c.contactRef, rowsByVehicle, rowsByContact);
    const mapped = mapContactVehicleToCustomerFields(row, dealershipId);
    const fact = display.get(normalizePbsRef(c.vehicleRef));
    const vin = String(mapped.vin || c.vin || fact?.vin || '');
    const payload: Record<string, unknown> = {
      ...mapped,
      make: mapped.make === 'Hyundai' && fact?.make ? fact.make : mapped.make,
      model: mapped.model === 'Unknown' && fact?.model ? fact.model : mapped.model,
      year: mapped.year || fact?.year,
      vin: vin || undefined,
      vinLast8: vin ? vin.slice(-8) : mapped.vinLast8,
      pbsVehicleId: c.vehicleRef,
      pbsVehicleRefs: [c.vehicleRef],
      pbsContactId: c.contactRef || mapped.pbsContactId,
      addedBy: 'pbs-sync',
      addedByUsername: 'PBS Sync',
      pbsCreatedFrom: 'repair-order',
      pbsSyncedAt: startedAt,
    };
    newProfiles.set(c.tempId, payload);
    owners.set(c.tempId, `${payload.firstName ?? ''} ${payload.lastName ?? ''}`.trim());
  }
  // A second PBS record for a car just given a profile joins it.
  for (const a of plan.attaches) {
    const fresh = newProfiles.get(a.customerId);
    if (fresh && a.addRef) (fresh.pbsVehicleRefs as string[]).push(a.vehicleRef);
  }

  if (options.dryRun) return { plan, created, owners };

  const writes: Array<(batch: WriteBatch) => void> = [];
  for (const [tempId, payload] of newProfiles) {
    const ref = customersCollection(db).doc();
    created.set(tempId, ref.id);
    const doc = stripUndefinedDeep({ ...payload, createdAt: Timestamp.now() });
    writes.push((batch) => batch.set(ref, doc));
    registerCustomerInIndex(index, ref.id, doc);
  }
  const realId = (id: string) => created.get(id) ?? id;

  for (const a of plan.attaches) {
    if (!a.addRef || newProfiles.has(a.customerId)) continue;
    const id = realId(a.customerId);
    const existing = index.dataById.get(id) || {};
    const patch: Record<string, unknown> = {
      ...stripUndefinedDeep({
        // The first PBS car a profile gets is also its main one.
        ...(existing.pbsVehicleId ? {} : { pbsVehicleId: a.vehicleRef }),
        // Fill gaps only — never overwrite what the profile already has.
        ...(existing.pbsContactId || !a.contactRef ? {} : { pbsContactId: a.contactRef }),
        ...(a.fillVin ? { vin: a.fillVin } : {}),
        pbsLinkedAt: startedAt,
        pbsLinkedFrom: 'repair-order',
      }),
      pbsVehicleRefs: FieldValue.arrayUnion(a.vehicleRef),
    };
    const ref = customersCollection(db).doc(id);
    writes.push((batch) => batch.set(ref, patch, { merge: true }));
    registerCustomerInIndex(index, id, {
      ...existing,
      ...patch,
      pbsVehicleRefs: [...vehicleRefsOf(existing), a.vehicleRef],
    });
  }

  for (const d of plan.duplicates) {
    const ref = customersCollection(db).doc(realId(d.customerId));
    writes.push((batch) =>
      batch.set(ref, { duplicateOfCustomerId: realId(d.duplicateOf), duplicateFlaggedAt: startedAt }, { merge: true })
    );
  }

  // Committed before the repair orders are retried, so a later window in the
  // same run sees these profiles.
  await commitBatches(db, writes);
  console.log(
    `[PBS Sync] Repair-order vehicles placed: ${plan.attaches.length} tied to existing profiles, ` +
      `${plan.creates.length} new profiles, ${plan.duplicates.length} duplicates flagged`
  );
  return { plan, created, owners };
}

/** Every cashiered repair order in the lookback window for the given vehicles. */
async function fetchRepairOrderHistoryForVehicles(vehicleRefs: string[]): Promise<PbsRepairOrder[]> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - REPAIR_ORDER_LOOKBACK_YEARS);
  const out: PbsRepairOrder[] = [];
  for (let i = 0; i < vehicleRefs.length; i += 50) {
    const response = await pbsRepairOrderGet({
      VehicleRefList: vehicleRefs.slice(i, i + 50),
      CashieredSince: toPbsPacificCriteriaIso(since.toISOString()),
    });
    out.push(...((response.RepairOrders || []) as PbsRepairOrder[]));
  }
  return out;
}

/**
 * What linking from repair orders WOULD do, for a month of them — read-only.
 *
 * The dry run before any customer is linked: how many repair orders attach
 * today, how many more would, and why the rest would not. Writes nothing.
 */
/** Whether the sync links customers from repair orders. Off until switched on. */
export async function setRepairOrderLinking(enabled: boolean, by: string): Promise<void> {
  const db = getAdminFirestore();
  if (!db) throw new Error('Firestore admin is not configured.');
  await dealershipSettingsDoc(db, PBS_AUTOMATED_SYNC_DEALERSHIP_ID).set(
    {
      pbsLinkFromRepairOrders: enabled,
      pbsLinkFromRepairOrdersChangedAt: new Date().toISOString(),
      pbsLinkFromRepairOrdersChangedBy: by,
    },
    { merge: true }
  );
}

export interface RepairOrderPlacementPreview {
  /** Whether matching is switched on for the sync right now. */
  enabled: boolean;
  month: string;
  /** Repair orders opened in the month, open and paid. */
  repairOrders: number;
  open: number;
  /** Reach a profile already, before any change. */
  inAFileToday: number;
  /** Would join an existing profile for their car. */
  toExistingProfiles: number;
  /** Would go into a profile created for their car. */
  toNewProfiles: number;
  /** Profiles that would be created. */
  newProfiles: number;
  /** Profiles found to be a second copy of another car's profile. */
  duplicatesFlagged: number;
  /** Must be 0 — every repair order lands in a file. */
  leftOver: number;
  examples: Array<{ owner: string; vehicle: string; repairOrders: number; action: 'existing' | 'new' }>;
}

/**
 * What placing a month of repair orders WOULD do — read-only.
 *
 * Every repair order opened that month, open and paid, run through the same
 * plan the sync uses, and nothing written: how many reach a file today, how
 * many would join an existing profile, how many profiles would be created, and
 * who. The number to look at before switching matching on.
 */
export async function previewRepairOrderLinking(monthKey: string): Promise<RepairOrderPlacementPreview> {
  const db = getAdminFirestore();
  if (!db) throw new Error('Firestore admin is not configured.');
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) throw new Error('Pass a month as YYYY-MM.');
  const start = `${monthKey}-01`;
  const end = `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

  const response = await pbsRepairOrderGet({
    OpenDateSince: `${start}T00:00:00.0000000-07:00`,
    OpenDateUntil: `${end}T23:59:59.9999999-07:00`,
  });
  const repairOrders = dedupeRepairOrders((response.RepairOrders || []) as PbsRepairOrder[]).filter(
    (ro) => shouldRecordRepairOrder(ro, undefined) && String(ro.VehicleRef || '').trim()
  );

  const index = await loadCustomerIndex(db, PBS_AUTOMATED_SYNC_DEALERSHIP_ID);
  const unplaced = repairOrders.filter(
    (ro) => !resolveCustomerIdByVehicle(index, { vehicleRef: String(ro.VehicleRef) })
  );
  const { plan, owners } = await placeRepairOrderVehicles(
    db,
    index,
    PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
    unplaced,
    new Date().toISOString(),
    { dryRun: true }
  );

  const destination = new Map<string, string>();
  for (const a of plan.attaches) destination.set(normalizePbsRef(a.vehicleRef), a.customerId);
  for (const c of plan.creates) destination.set(normalizePbsRef(c.vehicleRef), c.tempId);
  const isNew = (id: string) => plan.creates.some((c) => c.tempId === id);

  let toExisting = 0;
  let toNew = 0;
  let leftOver = 0;
  const perDestination = new Map<string, number>();
  for (const ro of unplaced) {
    const dest = destination.get(normalizePbsRef(String(ro.VehicleRef)));
    if (!dest) {
      leftOver += 1;
      continue;
    }
    if (isNew(dest)) toNew += 1;
    else toExisting += 1;
    perDestination.set(dest, (perDestination.get(dest) ?? 0) + 1);
  }

  const examples: RepairOrderPlacementPreview['examples'] = [];
  for (const [dest, count] of perDestination) {
    if (examples.length >= 15) break;
    if (isNew(dest)) {
      const c = plan.creates.find((x) => x.tempId === dest)!;
      examples.push({ owner: owners.get(dest) || 'Unknown owner', vehicle: c.vin ? `VIN …${c.vin.slice(-8)}` : 'No VIN from PBS', repairOrders: count, action: 'new' });
    } else {
      const d = index.dataById.get(dest) || {};
      examples.push({
        owner: `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || dest,
        vehicle: `${d.year ?? ''} ${d.make ?? ''} ${d.model ?? ''} …${String(d.vinLast8 || d.vin || '').slice(-8)}`.replace(/\s+/g, ' ').trim(),
        repairOrders: count,
        action: 'existing',
      });
    }
  }

  const enabled =
    (await dealershipSettingsDoc(db, PBS_AUTOMATED_SYNC_DEALERSHIP_ID).get()).data()?.pbsLinkFromRepairOrders === true;

  return {
    enabled,
    month: monthKey,
    repairOrders: repairOrders.length,
    open: repairOrders.filter(isOpenRepairOrder).length,
    inAFileToday: repairOrders.length - unplaced.length,
    toExistingProfiles: toExisting,
    toNewProfiles: toNew,
    newProfiles: plan.creates.length,
    duplicatesFlagged: plan.duplicates.length,
    leftOver,
    examples,
  };
}

async function processRepairOrdersBatch(
  ctx: PbsSyncStageContext,
  repairOrders: PbsRepairOrder[]
): Promise<void> {
  const { db, dealershipId, startedAt, watermark, counts } = ctx;
  const index = await loadCustomerIndex(db, dealershipId);

  /*
    Matching is off until someone has looked at the preview and switched it on:
    it creates profiles and writes to existing ones, so it does not start on its
    own. Off is exactly the old behaviour — paid repair orders only, and only
    for profiles already tied to their PBS car. On is Jaryn's rule: every repair
    order, open or paid, goes into its car's profile, made if need be.
  */
  const matchingOn =
    (await dealershipSettingsDoc(db, dealershipId).get()).data()?.pbsLinkFromRepairOrders === true;
  const shouldTake = (ro: PbsRepairOrder, applyWatermark: boolean) => {
    const wm = applyWatermark ? watermark : undefined;
    return matchingOn ? shouldRecordRepairOrder(ro, wm) : shouldLogRepairOrderVisit(ro, wm);
  };

  const visitsByCustomer = new Map<string, Array<Record<string, unknown>>>();
  const seenRepairOrders = new Set<string>();

  /** One repair order → a visit on its car's profile, if it has one yet. */
  const collect = (ro: PbsRepairOrder, applyWatermark: boolean): 'added' | 'no-customer' | 'skipped' => {
    if (!shouldTake(ro, applyWatermark)) return 'skipped';

    const vehicleRef = (ro.VehicleRef || '').trim();
    if (!vehicleRef) return 'skipped';

    const visit = mapRepairOrderToVisit(ro);
    if (!visit) return 'skipped';
    if (seenRepairOrders.has(visit.soNumber)) return 'skipped';

    const customerId = resolveCustomerIdByVehicle(index, { vehicleRef });
    if (!customerId) return 'no-customer';

    // A profile can be tied to several PBS records for its car; any of them counts.
    const existing = index.dataById.get(customerId) || {};
    const refs = vehicleRefsOf(existing).map(normalizePbsRef);
    if (refs.length > 0 && !refs.includes(normalizePbsRef(vehicleRef))) return 'skipped';
    seenRepairOrders.add(visit.soNumber);

    const list = visitsByCustomer.get(customerId) || [];
    list.push({
      id: `pbs-${visit.soNumber}`,
      soNumber: visit.soNumber,
      date: visit.date,
      openedDate: visit.openedDate,
      mileage: visit.mileage,
      advisor: visit.advisor,
      requests: visit.requests,
      status: visit.status,
      // Not paid yet. The same document is updated in place once it is.
      open: isOpenRepairOrder(ro),
      lines: visit.lines,
      payTypeTotals: visit.payTypeTotals,
      pbsVehicleRef: vehicleRef,
      pbsSyncedAt: startedAt,
      createdAt: Timestamp.now(),
    });
    counts.visitsLogged += 1;
    visitsByCustomer.set(customerId, list);
    return 'added';
  };

  const unmatched: PbsRepairOrder[] = [];
  for (const ro of repairOrders) {
    if (collect(ro, true) === 'no-customer') unmatched.push(ro);
  }

  /*
    Repair orders whose car has no profile tied to it. They used to be dropped —
    most of every pull, because 7,641 of 9,955 Hyundai profiles had never been
    tied to a PBS car. Now each car is put in the profile for its VIN, or one is
    created for it (pbsVehicleProfilePlan has the rules), and the repair orders
    are tried again. Nothing is left without a file.
  */
  if (unmatched.length > 0 && !matchingOn) {
    counts.repairOrdersUnmatched = (counts.repairOrdersUnmatched ?? 0) + unmatched.length;
  }
  if (unmatched.length > 0 && matchingOn) {
    const { plan } = await placeRepairOrderVehicles(db, index, dealershipId, unmatched, startedAt);
    counts.vehiclesLinked = (counts.vehiclesLinked ?? 0) + plan.attaches.filter((a) => a.addRef).length;
    counts.profilesCreated = (counts.profilesCreated ?? 0) + plan.creates.length;

    let leftOver = 0;
    for (const ro of unmatched) if (collect(ro, true) === 'no-customer') leftOver += 1;
    counts.repairOrdersUnmatched = (counts.repairOrdersUnmatched ?? 0) + leftOver;

    // A daily pull only sees what changed since the last run. A car that just
    // got its profile has years of history PBS has never sent us; fetch it, so
    // the file fills in today rather than one visit at a time from now on.
    // (A full refresh walks the whole history itself, so it skips this.)
    const newlyPlaced = [
      ...plan.attaches.filter((a) => a.addRef).map((a) => a.vehicleRef),
      ...plan.creates.map((c) => c.vehicleRef),
    ];
    if (watermark && newlyPlaced.length > 0) {
      const history = await fetchRepairOrderHistoryForVehicles(newlyPlaced);
      for (const ro of history) collect(ro, false);
    }
  }

  /*
    Each visit is its own document under the customer, and the customer record
    gets a compact summary. This replaces writing the whole history back into
    the customer, which is what made the app slow to open — and it removes the
    two ways a visit used to be lost here: the trim to the newest 300, and the
    rule that dropped imported rows inside the PBS window.

    Nothing below deletes. A re-pulled repair order lands on its own document,
    pbs-{soNumber}, and is updated in place. Visits still sitting in a
    customer's old array are left exactly where they are; the migration moves
    those, and only after verifying the copy.
  */
  const visitWrites: Array<(batch: WriteBatch) => void> = [];
  const now = new Date().toISOString();
  for (const [customerId, incomingVisits] of visitsByCustomer) {
    const existing = index.dataById.get(customerId) || {};
    const customerDealership = String(existing.dealershipId || dealershipId);
    const customerRef = customersCollection(db).doc(customerId);

    const assigned = incomingVisits.map((visit) => ({ docId: String(visit.id), visit }));
    for (const { docId, visit } of assigned) {
      const visitRef = customerRef.collection(SERVICE_VISITS_COLLECTION).doc(docId);
      // dealershipId on every visit is what the security rules check, and
      // what lets a report query a month of visits across customers.
      const data = stripUndefinedDeep({ ...visit, customerId, dealershipId: customerDealership });
      visitWrites.push((batch) => batch.set(visitRef, data, { merge: true }));
    }

    // Build on the summary the customer already has. One not yet migrated has
    // none, so start from their old array: the summary always covers every
    // visit, old and new, whichever state the customer is in.
    // Imported entries are recomputed every time, so a summary written under
    // older date rules heals itself on the next sync that touches it.
    const base: VisitSummary = refreshSummaryFromEmbedded(
      existing.visitSummary as VisitSummary | undefined,
      (existing.recentVisits as StoredVisit[] | undefined) ?? [],
      now
    );
    const summary = mergeIntoSummary(base, assigned, now);

    const latestDate = summary.entries.find((e) => e.date)?.date;
    const latestMileage = summary.last?.mileage ?? 0;
    const patch = stripUndefinedDeep({
      visitSummary: summary,
      pbsSyncedAt: startedAt,
      ...(latestDate ? { lastServiceDate: latestDate } : {}),
      ...(latestMileage > 0 ? { mileage: String(latestMileage) } : {}),
    });
    visitWrites.push((batch) => batch.set(customerRef, patch, { merge: true }));
    counts.visitsMerged += incomingVisits.length;
  }

  await commitBatches(db, visitWrites);
}

async function stageRepairOrders(ctx: PbsSyncStageContext): Promise<PbsSyncStageOutcome> {
  const { watermark, fetched } = ctx;

  if (watermark) {
    const repairOrders = await fetchRepairOrdersIncremental(watermark);
    fetched.repairOrders = (fetched.repairOrders || 0) + repairOrders.length;
    console.log(
      `[PBS Sync] Repair orders fetched: ${repairOrders.length} (incremental since ${watermark})`
    );
    await processRepairOrdersBatch(ctx, repairOrders);
    return {};
  }

  // Full history — process one date window per request so no single call times out.
  const windows = buildRoHistoryWindows();
  const windowIndex = Math.max(0, Number(ctx.stageCursor || 0) || 0);
  const window = windows[windowIndex];
  if (!window) return {};

  const repairOrders = await fetchRepairOrdersHistoryWindow(window);
  fetched.repairOrders = (fetched.repairOrders || 0) + repairOrders.length;
  console.log(
    `[PBS Sync] Repair orders window ${windowIndex + 1}/${windows.length} (${window.sinceIso.slice(0, 10)}..${window.untilIso.slice(0, 10)}): ${repairOrders.length} ROs`
  );

  // The history windows are paid repair orders. With matching on, the first
  // window also takes everything open right now, so a full refresh puts every
  // open repair order in its car's file too — not just ones touched later.
  if (windowIndex === 0) {
    const matchingOn =
      (await dealershipSettingsDoc(ctx.db, ctx.dealershipId).get()).data()?.pbsLinkFromRepairOrders === true;
    if (matchingOn) {
      const since = new Date();
      since.setDate(since.getDate() - OPEN_REPAIR_ORDER_LOOKBACK_DAYS);
      const response = await pbsRepairOrderGet({ OpenDateSince: toPbsPacificCriteriaIso(since.toISOString()) });
      const open = ((response.RepairOrders || []) as PbsRepairOrder[]).filter(isOpenRepairOrder);
      console.log(`[PBS Sync] Open repair orders taken with the first window: ${open.length}`);
      repairOrders.push(...open);
    }
  }

  await processRepairOrdersBatch(ctx, dedupeRepairOrders(repairOrders));

  const nextIndex = windowIndex + 1;
  if (nextIndex < windows.length) {
    return {
      moreWork: true,
      cursor: String(nextIndex),
      detail: `history window ${nextIndex + 1} of ${windows.length}`,
    };
  }
  return {};
}

/**
 * Appointments still Open after their day whose car had a repair order opened
 * that same day — the customer came in, but the advisor wrote a fresh repair
 * order instead of converting the appointment. Without this they would read as
 * no-shows. Keys are appointmentArrivalKey(vehicle, day).
 */
async function findSameDayRepairOrders(
  appointments: readonly PbsAppointment[],
  start: string,
  end: string
): Promise<Set<string>> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const refs = new Set<string>();
  for (const appt of appointments) {
    if (!/^(open)?$/i.test(String(appt.Status || '').trim())) continue;
    const date = pbsAppointmentPacificDate(appt.AppointmentTime, appt.AppointmentTimeUTC);
    if (!date || date >= today || date < start || date > end) continue;
    const ref = String(appt.VehicleRef || '').trim();
    if (ref) refs.add(ref);
  }
  const keys = new Set<string>();
  const list = [...refs];
  for (let i = 0; i < list.length; i += 50) {
    const response = await pbsRepairOrderGet({
      VehicleRefList: list.slice(i, i + 50),
      OpenDateSince: `${start}T00:00:00.0000000-07:00`,
      OpenDateUntil: `${end}T23:59:59.9999999-07:00`,
    });
    for (const ro of (response.RepairOrders || []) as PbsRepairOrder[]) {
      const opened = pbsIsoToDateString(ro.DateOpened);
      if (opened) keys.add(appointmentArrivalKey(String(ro.VehicleRef || ''), opened));
    }
  }
  return keys;
}

export interface AppointmentMonthResult {
  appointments: number;
  daysUpdated: number;
  scheduleDays?: number;
  scheduleSlots?: number;
  scheduleError?: string;
  /** Open appointments counted as shown because a repair order opened that day. */
  arrivedByRepairOrder?: number;
}

/**
 * One month of PBS appointments → the daily counts and the day-by-day schedule.
 * The sync runs it for the current month; the month rebuild runs it for a past one.
 */
export async function syncAppointmentMonth(
  db: Firestore,
  dealershipId: string,
  start: string,
  end: string,
  startedAt: string,
  watermark?: string
): Promise<AppointmentMonthResult> {
  const index = await loadCustomerIndex(db, dealershipId);
  const result: AppointmentMonthResult = { appointments: 0, daysUpdated: 0 };

  const [appointments, appointmentDisplayInfo] = await Promise.all([
    fetchAppointmentsForSync(start, end, watermark),
    fetchMonthAppointmentDisplayInfo(start, end, watermark),
  ]);
  result.appointments = appointments.length;
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
    result.daysUpdated += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  await commitBatches(db, trackerWrites);

  // A failed lookup only costs the show-up rate its correction; the schedule
  // itself still goes in.
  let arrivedKeys: Set<string> | undefined;
  try {
    arrivedKeys = await findSameDayRepairOrders(appointments, start, end);
  } catch (err) {
    console.warn('[PBS Sync] Same-day repair order check failed:', err instanceof Error ? err.message : err);
  }

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
      displayInfoWithFallback,
      arrivedKeys
    );
    result.scheduleDays = scheduleResult.daysWritten;
    result.scheduleSlots = scheduleResult.slotsWritten;
    result.arrivedByRepairOrder = scheduleResult.arrivedByRepairOrder;
  } catch (scheduleErr) {
    const message = scheduleErr instanceof Error ? scheduleErr.message : String(scheduleErr);
    console.error('[PBS Sync] Appointment schedule failed:', scheduleErr);
    result.scheduleError = message;
  }
  return result;
}

async function stageAppointments(ctx: PbsSyncStageContext): Promise<PbsSyncStageOutcome> {
  const { db, dealershipId, startedAt, watermark, counts, fetched, monthRange } = ctx;
  const r = await syncAppointmentMonth(db, dealershipId, monthRange.start, monthRange.end, startedAt, watermark);
  fetched.appointments = r.appointments;
  counts.appointmentsProcessed = r.appointments;
  counts.appointmentDaysUpdated += r.daysUpdated;
  if (r.scheduleDays != null) counts.appointmentScheduleDays = r.scheduleDays;
  if (r.scheduleSlots != null) counts.appointmentScheduleSlots = r.scheduleSlots;
  if (r.scheduleError) counts.appointmentScheduleError = r.scheduleError;
  return {};
}

async function stagePerformance(ctx: PbsSyncStageContext): Promise<PbsSyncStageOutcome> {
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
    if (technician.warning) {
      counts.technicianSyncWarning = technician.warning;
    }
  } catch (techErr) {
    const message = techErr instanceof Error ? techErr.message : String(techErr);
    console.error('[PBS Sync] Technician performance failed:', techErr);
    counts.technicianSyncError = message;
  }
  return {};
}

async function stageExtended(ctx: PbsSyncStageContext): Promise<PbsSyncStageOutcome> {
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
  return {};
}

const PBS_SYNC_STAGE_RUNNERS: Record<
  PbsSyncStageName,
  (ctx: PbsSyncStageContext) => Promise<PbsSyncStageOutcome>
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
      let cursor: string | undefined;
      do {
        const outcome = await PBS_SYNC_STAGE_RUNNERS[stage]({ ...ctx, stageCursor: cursor });
        cursor = outcome.moreWork ? outcome.cursor : undefined;
      } while (cursor);
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
  /** Sub-progress within a chunked stage (e.g. "history window 2 of 6"). */
  detail?: string;
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
    stageCursor: run.stageCursor ?? undefined,
  };

  let outcome: PbsSyncStageOutcome;
  try {
    outcome = await PBS_SYNC_STAGE_RUNNERS[stage](ctx);
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

  // Chunked stage with more work — same stage continues in the next request.
  if (outcome.moreWork) {
    await writePbsSyncState(db, dealershipId, {
      ...(state as PbsSyncState),
      syncInProgress: true,
      syncStartedAt: new Date().toISOString(),
      stagedRun: {
        ...run,
        stageCursor: outcome.cursor,
        counts,
        fetched,
      },
    });

    return {
      ok: true,
      nextStage: stage,
      stageIndex: PBS_SYNC_STAGES.indexOf(stage) + 1,
      totalStages: PBS_SYNC_STAGES.length,
      detail: outcome.detail,
    };
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
      stageCursor: null,
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

/** The saved sync state, for callers outside this module (the scheduler). */
export async function readPbsSyncStateFor(dealershipId: string): Promise<PbsSyncState | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  return readPbsSyncState(db, dealershipId);
}

/**
 * Give up on a staged run that will not finish, and say so in the sync log.
 *
 * Without this a run that dies mid-stage leaves no record at all — which is how
 * three weeks of 6 AM pulls vanished. Failing it writes a log entry with the
 * reason, clears the lock, and leaves the next pull time to start afresh.
 */
export async function failStagedPbsSync(reason: string): Promise<PbsSyncResult | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const dealershipId = PBS_AUTOMATED_SYNC_DEALERSHIP_ID;
  const state = await readPbsSyncState(db, dealershipId);
  const run = state?.stagedRun;
  if (!run) return null;
  const monthStart = run.fetched?.appointmentMonthStart || monthRangePacific().start;
  const monthEnd = run.fetched?.appointmentMonthEnd || monthRangePacific().end;
  return finalizePbsSyncRun(
    db,
    dealershipId,
    run.runId,
    {
      triggeredBy: run.triggeredBy,
      triggeredByEmail: run.triggeredByEmail,
      triggeredByUsername: run.triggeredByUsername,
      fullRefresh: run.fullRefresh,
    },
    { ...emptyCounts(), ...run.counts },
    { ...emptyFetched(monthStart, monthEnd), ...run.fetched },
    false,
    reason
  );
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
