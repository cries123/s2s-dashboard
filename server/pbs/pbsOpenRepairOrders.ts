import { getAdminFirestore } from '../admin/initFirebaseAdmin.js';
import { pbsRepairOrderGet } from './partnerHubClient.js';
import { customersCollection } from './pbsFirestore.js';
import {
  normalizePhone,
  pbsIsoToDateString,
  repairOrderSoNumber,
  vinLast8FromVin,
  mapRepairOrderToVisit,
  type RepairOrderPayTypeTotals,
} from './pbsMappers.js';
import { normalizePbsRef } from './pbsAppointmentSchedule.js';
import { customerBelongsToPbsSyncDealership, PBS_AUTOMATED_SYNC_DEALERSHIP_ID } from './pbsDealershipScope.js';
import type { PbsCustomerIndexMaps, PbsOpenRepairOrder } from './pbsExtendedTypes.js';
import { isOpenPbsRepairOrder } from './pbsTechnicianAggregator.js';
import { mapPbsDispatchStatus } from './pbsDispatchMapper.js';
import { fetchContactNamesByRefs, type PbsContactName } from './pbsContactNameFallback.js';
import {
  fetchContactVehicleDisplayByRefs,
  formatPbsDisplayName,
  formatPbsVehicleLabel,
  lookupContactDisplay,
  lookupVehicleDisplay,
  type PbsRefDisplayInfo,
} from './pbsContactVehicleFallback.js';
import {
  indexCustomerNameKeys,
  resolveUniqueCustomerByName,
} from './openRoCustomerMatch.js';
import type { PbsRepairOrder } from './pbsTypes.js';

const OPEN_RO_LOOKBACK_DAYS = 90;

export interface OpenRepairOrderRow {
  repairOrderId: string;
  roNumber: string;
  status: string;
  customStatus?: string;
  laneStatus: string;
  tag?: string;
  shop?: string;
  advisor: string;
  techNumber?: string;
  dateOpened: string;
  dateOpenedLabel: string;
  datePromisedLabel?: string;
  daysOpen: number;
  concern?: string;
  transportation?: string;
  phoneNumber?: string;
  customerId?: string;
  customerName?: string;
  vehicleLabel?: string;
  vinLast8?: string;
  isWaiting?: boolean;
}

export interface OpenRepairOrderVisitLine {
  lineNumber: number;
  requestCode?: string;
  concern?: string;
  cause?: string;
  correction?: string;
  tech?: string;
  status?: string;
  labourLines?: Array<{
    opCode?: string;
    description?: string;
    soldHours?: number;
    tech?: string;
    price?: number;
  }>;
  partLines?: Array<{
    partNumber?: string;
    description?: string;
    qty?: number;
    price?: number;
  }>;
}

export interface OpenRepairOrderDetail {
  repairOrderId: string;
  roNumber: string;
  status: string;
  customStatus?: string;
  customerName?: string;
  vehicleLabel?: string;
  customerId?: string;
  visit: {
    soNumber: string;
    date: string;
    mileage: number;
    advisor: string;
    requests: string;
    status?: string;
    lines: OpenRepairOrderVisitLine[];
    payTypeTotals?: RepairOrderPayTypeTotals;
  };
}

interface OpenRoCustomerIndex extends PbsCustomerIndexMaps {
  byPhone: Map<string, string>;
  byVinLast8: Map<string, string>;
  byVin: Map<string, string>;
  byName: Map<string, string[]>;
}

interface OpenRoEnrichment {
  byVehicleRef: Map<string, PbsRefDisplayInfo>;
  byContactRef: Map<string, PbsRefDisplayInfo>;
  contactNames: Map<string, PbsContactName>;
}

function openRoLookbackIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function fetchOpenRepairOrdersFromPbs(): Promise<PbsOpenRepairOrder[]> {
  const response = await pbsRepairOrderGet({
    OpenDateSince: openRoLookbackIso(OPEN_RO_LOOKBACK_DAYS),
  });
  return (response.RepairOrders || []) as PbsOpenRepairOrder[];
}

async function loadCustomerIndexForOpenRos(
  dealershipId: string
): Promise<OpenRoCustomerIndex> {
  const db = getAdminFirestore();
  const index: OpenRoCustomerIndex = {
    byContactRef: new Map(),
    byVehicleRef: new Map(),
    byPhone: new Map(),
    byVinLast8: new Map(),
    byVin: new Map(),
    byName: new Map(),
    dataById: new Map(),
  };
  if (!db) return index;

  const snap = await customersCollection(db).get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!customerBelongsToPbsSyncDealership(data, dealershipId)) continue;
    index.dataById.set(docSnap.id, data);

    const vehicleRef = normalizePbsRef(String(data.pbsVehicleId || ''));
    if (vehicleRef) index.byVehicleRef.set(vehicleRef, docSnap.id);

    const contactRef = normalizePbsRef(String(data.pbsContactId || ''));
    if (contactRef) index.byContactRef.set(contactRef, docSnap.id);

    const phone = normalizePhone(String(data.phone || ''));
    if (phone) index.byPhone.set(phone, docSnap.id);

    const vin = String(data.vin || '').replace(/\s/g, '').toUpperCase();
    const vinLast8 = String(data.vinLast8 || vinLast8FromVin(vin)).toUpperCase();
    if (vinLast8) index.byVinLast8.set(vinLast8, docSnap.id);
    if (vin) index.byVin.set(vin, docSnap.id);

    indexCustomerNameKeys(
      index.byName,
      docSnap.id,
      String(data.firstName || ''),
      String(data.lastName || '')
    );
  }

  return index;
}

function resolveCustomerFromIndex(
  index: OpenRoCustomerIndex,
  ro: PbsOpenRepairOrder,
  vinLast8Hint?: string,
  fullVinHint?: string
): { customerId?: string; customer?: Record<string, unknown> } {
  const contactRef = normalizePbsRef(ro.ContactRef);
  if (contactRef) {
    const id = index.byContactRef.get(contactRef);
    if (id) return { customerId: id, customer: index.dataById.get(id) };
  }
  const vehicleRef = normalizePbsRef(ro.VehicleRef);
  if (vehicleRef) {
    const id = index.byVehicleRef.get(vehicleRef);
    if (id) return { customerId: id, customer: index.dataById.get(id) };
  }

  const phone = normalizePhone(ro.TodayPhoneNumber || '');
  if (phone) {
    const id = index.byPhone.get(phone);
    if (id) return { customerId: id, customer: index.dataById.get(id) };
  }

  const fullVin = (fullVinHint || '').replace(/\s/g, '').toUpperCase();
  if (fullVin) {
    const id = index.byVin.get(fullVin);
    if (id) return { customerId: id, customer: index.dataById.get(id) };
  }

  const vinKey = (vinLast8Hint || '').trim().toUpperCase();
  if (vinKey) {
    const id = index.byVinLast8.get(vinKey);
    if (id) return { customerId: id, customer: index.dataById.get(id) };
  }

  return {};
}

function resolveCustomerForOpenRo(
  index: OpenRoCustomerIndex,
  ro: PbsOpenRepairOrder,
  enrichment: OpenRoEnrichment | undefined,
  pbsDisplay: { customerName?: string; vehicleLabel?: string; vinLast8?: string },
  vehicleFromRo?: PbsRefDisplayInfo
): { customerId?: string; customer?: Record<string, unknown> } {
  const fullVin = vehicleFromRo?.vin;
  const vinLast8 =
    (fullVin ? vinLast8FromVin(fullVin) : undefined) || pbsDisplay.vinLast8;

  const contactInfo = enrichment
    ? lookupContactDisplay(enrichment.byContactRef, ro.ContactRef)
    : undefined;
  const pbsPhone = contactInfo?.phone;

  let match = resolveCustomerFromIndex(
    index,
    ro,
    vinLast8,
    fullVin
  );
  if (match.customer) return match;

  if (pbsPhone) {
    match = resolveCustomerFromIndex(
      index,
      { ...ro, TodayPhoneNumber: pbsPhone },
      vinLast8,
      fullVin
    );
    if (match.customer) return match;
  }

  if (pbsDisplay.customerName) {
    match = resolveUniqueCustomerByName(
      index.byName,
      pbsDisplay.customerName,
      index.dataById
    );
    if (match.customer) return match;
  }

  return {};
}

function customerNameFromRecord(customer: Record<string, unknown>): string | undefined {
  const firstName = String(customer.firstName || '').trim();
  const lastName = String(customer.lastName || '').trim();
  const full = [firstName, lastName].filter(Boolean).join(' ');
  return full ? full.toUpperCase() : undefined;
}

function vehicleLabelFromRecord(customer: Record<string, unknown>): string | undefined {
  const year = String(customer.year || '').trim();
  const make = String(customer.make || '').trim();
  const model = String(customer.model || '').trim();
  return [year, make, model].filter(Boolean).join(' ') || undefined;
}

function vinLast8FromRecord(customer: Record<string, unknown>): string | undefined {
  const vin = String(customer.vin || '');
  const vinLast8 = String(customer.vinLast8 || vinLast8FromVin(vin));
  return vinLast8 || undefined;
}

async function buildEnrichmentForOpenRos(
  repairOrders: PbsOpenRepairOrder[]
): Promise<OpenRoEnrichment> {
  const vehicleRefs: string[] = [];
  const contactRefs: string[] = [];

  for (const ro of repairOrders) {
    const vehicleRef = (ro.VehicleRef || '').trim();
    const contactRef = (ro.ContactRef || '').trim();
    if (vehicleRef) vehicleRefs.push(vehicleRef);
    if (contactRef) contactRefs.push(contactRef);
  }

  const [pbsDisplay, contactNames] = await Promise.all([
    fetchContactVehicleDisplayByRefs(vehicleRefs, contactRefs),
    fetchContactNamesByRefs(contactRefs),
  ]);

  return {
    byVehicleRef: pbsDisplay.byVehicleRef,
    byContactRef: pbsDisplay.byContactRef,
    contactNames,
  };
}

function resolvePbsFallbackDisplay(
  ro: PbsOpenRepairOrder,
  enrichment: OpenRoEnrichment
): { customerName?: string; vehicleLabel?: string; vinLast8?: string } {
  const vehicleKey = normalizePbsRef(ro.VehicleRef);
  const contactKey = normalizePbsRef(ro.ContactRef);
  const vehicleInfo = vehicleKey ? enrichment.byVehicleRef.get(vehicleKey) : undefined;
  const contactInfo = contactKey ? enrichment.byContactRef.get(contactKey) : undefined;
  const namedContact = contactKey ? enrichment.contactNames.get(contactKey) : undefined;

  const displayInfo = vehicleInfo || contactInfo;
  const customerName =
    formatPbsDisplayName(displayInfo) ||
    formatPbsDisplayName(namedContact) ||
    undefined;
  const vehicleLabel = formatPbsVehicleLabel(vehicleInfo || contactInfo);
  const vin = displayInfo?.vin;
  const vinLast8 = vin ? vinLast8FromVin(vin) : undefined;

  return { customerName, vehicleLabel, vinLast8 };
}

function pickPrimaryTech(ro: PbsOpenRepairOrder): string {
  for (const req of ro.Requests || []) {
    const tech = (req.Tech || '').trim();
    if (tech) return tech;
    for (const line of req.LabourLines || []) {
      const lineTech = (line.Tech || '').trim();
      if (lineTech) return lineTech;
    }
  }
  return '';
}

function pickConcern(ro: PbsOpenRepairOrder): string | undefined {
  const parts = (ro.Requests || [])
    .map((req) => req.RequestDescription?.trim())
    .filter(Boolean) as string[];
  if (!parts.length) return undefined;
  return parts.join('; ').slice(0, 500);
}

function formatDisplayDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(isoDate: string, now = new Date()): number {
  const opened = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(opened.getTime())) return 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  opened.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - opened.getTime()) / (1000 * 60 * 60 * 24)));
}

export function mapOpenRepairOrderRow(
  ro: PbsOpenRepairOrder,
  index: OpenRoCustomerIndex,
  enrichment?: OpenRoEnrichment
): OpenRepairOrderRow | null {
  if (!isOpenPbsRepairOrder(ro)) return null;

  const repairOrderId = (ro.RepairOrderId || '').trim();
  const roNumber = repairOrderSoNumber(ro);
  if (!repairOrderId || !roNumber) return null;

  const pbsDisplay = enrichment ? resolvePbsFallbackDisplay(ro, enrichment) : {};
  const vehicleFromRo = enrichment
    ? lookupVehicleDisplay(enrichment.byVehicleRef, ro.VehicleRef)
    : undefined;
  const vehicleLabelFromPbs =
    formatPbsVehicleLabel(vehicleFromRo) || pbsDisplay.vehicleLabel;
  const vinLast8FromPbs =
    (vehicleFromRo?.vin ? vinLast8FromVin(vehicleFromRo.vin) : undefined) || pbsDisplay.vinLast8;

  const { customerId, customer } = resolveCustomerForOpenRo(
    index,
    ro,
    enrichment,
    pbsDisplay,
    vehicleFromRo
  );

  let customerName: string | undefined;
  let vehicleLabel: string | undefined;
  let vinLast8: string | undefined;

  if (customer) {
    customerName = customerNameFromRecord(customer);
    vehicleLabel = vehicleLabelFromPbs || vehicleLabelFromRecord(customer);
    vinLast8 = vinLast8FromPbs || vinLast8FromRecord(customer);
  } else {
    customerName = pbsDisplay.customerName;
    vehicleLabel = vehicleLabelFromPbs;
    vinLast8 = vinLast8FromPbs;
  }

  if (!vehicleLabel && enrichment) {
    const contactKey = normalizePbsRef(ro.ContactRef);
    const contactInfo = contactKey ? enrichment.byContactRef.get(contactKey) : undefined;
    vehicleLabel = formatPbsVehicleLabel(contactInfo);
    if (!vinLast8 && contactInfo?.vin) {
      vinLast8 = vinLast8FromVin(contactInfo.vin);
    }
  }

  const dateOpened = pbsIsoToDateString(ro.DateOpened) || new Date().toISOString().slice(0, 10);
  const promiseIso = ro.DatePromisedUTC || ro.DatePromised;
  const datePromised =
    promiseIso && !promiseIso.startsWith('0001-01-01')
      ? pbsIsoToDateString(promiseIso) || undefined
      : undefined;

  const transportation = (ro.Transportation || '').trim();
  const isWaiting = transportation.toLowerCase().includes('wait');
  const laneStatus = mapPbsDispatchStatus(ro.Status, ro.CustomStatus);

  return {
    repairOrderId,
    roNumber,
    status: (ro.Status || 'Open').trim(),
    customStatus: ro.CustomStatus?.trim() || undefined,
    laneStatus,
    tag: ro.Tag?.trim() || undefined,
    shop: ro.Shop?.trim() || undefined,
    advisor: (ro.CSR || '').trim() || '—',
    techNumber: pickPrimaryTech(ro) || undefined,
    dateOpened,
    dateOpenedLabel: formatDisplayDate(dateOpened) || dateOpened,
    datePromisedLabel: formatDisplayDate(datePromised),
    daysOpen: daysBetween(dateOpened),
    concern: pickConcern(ro),
    transportation: transportation || undefined,
    phoneNumber: customer
      ? normalizePhone(String(customer.phone || ro.TodayPhoneNumber || '')) ||
        ro.TodayPhoneNumber?.trim() ||
        undefined
      : ro.TodayPhoneNumber?.trim() || undefined,
    customerId,
    customerName,
    vehicleLabel,
    vinLast8: vinLast8 || undefined,
    isWaiting: isWaiting || undefined,
  };
}

async function fetchRepairOrderById(repairOrderId: string): Promise<PbsOpenRepairOrder | null> {
  const id = repairOrderId.trim();
  if (!id) return null;

  try {
    const byId = await pbsRepairOrderGet({ RepairOrderId: id });
    const direct = ((byId.RepairOrders || []) as PbsOpenRepairOrder[]).find(
      (ro) => (ro.RepairOrderId || '').trim() === id
    );
    if (direct) return direct;
  } catch {
    /* fall through to open-RO scan */
  }

  const openOrders = await fetchOpenRepairOrdersFromPbs();
  return openOrders.find((ro) => (ro.RepairOrderId || '').trim() === id) || null;
}

export async function getOpenRepairOrderDetail(
  repairOrderId: string,
  dealershipId: string = PBS_AUTOMATED_SYNC_DEALERSHIP_ID
): Promise<OpenRepairOrderDetail | null> {
  const ro = await fetchRepairOrderById(repairOrderId);
  if (!ro || !isOpenPbsRepairOrder(ro)) return null;

  const index = await loadCustomerIndexForOpenRos(dealershipId);
  const enrichment = await buildEnrichmentForOpenRos([ro]);
  const row = mapOpenRepairOrderRow(ro, index, enrichment);
  if (!row) return null;

  const visit = mapRepairOrderToVisit(ro as PbsRepairOrder);
  if (!visit) return null;

  const statusLabel = [row.status, row.customStatus].filter(Boolean).join(' · ') || row.status;

  return {
    repairOrderId: row.repairOrderId,
    roNumber: row.roNumber,
    status: row.status,
    customStatus: row.customStatus,
    customerName: row.customerName,
    vehicleLabel: row.vehicleLabel,
    customerId: row.customerId,
    visit: {
      ...visit,
      status: statusLabel,
      advisor: row.advisor !== '—' ? row.advisor : visit.advisor,
    },
  };
}

/**
 * Open ROs require a live PBS repair-order pull plus fallback contact/vehicle lookups
 * and a full customers-collection read, every one of which is a real network round trip
 * to PBS PartnerHUB — that chain is what makes a cold load slow. A short in-memory cache
 * keeps repeat page visits (tab switches, re-renders) fast without going back to PBS each
 * time; the page's "Refresh from PBS" button passes forceRefresh to always get live data.
 */
const OPEN_RO_CACHE_TTL_MS = 60_000;
let openRoCache: { dealershipId: string; expiresAt: number; result: { orders: OpenRepairOrderRow[]; fetchedAt: string } } | null = null;

export async function listOpenRepairOrdersForDealership(
  dealershipId: string = PBS_AUTOMATED_SYNC_DEALERSHIP_ID,
  opts: { forceRefresh?: boolean } = {}
): Promise<{ orders: OpenRepairOrderRow[]; fetchedAt: string }> {
  const now = Date.now();
  if (
    !opts.forceRefresh &&
    openRoCache &&
    openRoCache.dealershipId === dealershipId &&
    openRoCache.expiresAt > now
  ) {
    return openRoCache.result;
  }

  const [repairOrders, index] = await Promise.all([
    fetchOpenRepairOrdersFromPbs(),
    loadCustomerIndexForOpenRos(dealershipId),
  ]);

  const openOrders = repairOrders.filter(isOpenPbsRepairOrder);
  const enrichment = await buildEnrichmentForOpenRos(openOrders);

  const orders = openOrders
    .map((ro) => mapOpenRepairOrderRow(ro, index, enrichment))
    .filter((row): row is OpenRepairOrderRow => Boolean(row))
    .sort((a, b) => {
      const byDays = b.daysOpen - a.daysOpen;
      if (byDays !== 0) return byDays;
      return a.roNumber.localeCompare(b.roNumber);
    });

  const result = { orders, fetchedAt: new Date().toISOString() };
  openRoCache = { dealershipId, expiresAt: now + OPEN_RO_CACHE_TTL_MS, result };
  return result;
}
