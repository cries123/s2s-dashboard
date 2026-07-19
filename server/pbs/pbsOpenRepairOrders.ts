import { getAdminFirestore } from '../admin/initFirebaseAdmin.js';
import { pbsRepairOrderGet } from './partnerHubClient.js';
import { customersCollection } from './pbsFirestore.js';
import { normalizePhone, pbsIsoToDateString, repairOrderSoNumber, vinLast8FromVin } from './pbsMappers.js';
import { normalizePbsRef } from './pbsAppointmentSchedule.js';
import { customerBelongsToPbsSyncDealership, PBS_AUTOMATED_SYNC_DEALERSHIP_ID } from './pbsDealershipScope.js';
import type { PbsCustomerIndexMaps, PbsOpenRepairOrder } from './pbsExtendedTypes.js';
import { isOpenPbsRepairOrder } from './pbsTechnicianAggregator.js';
import { mapPbsDispatchStatus } from './pbsDispatchMapper.js';

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
): Promise<PbsCustomerIndexMaps> {
  const db = getAdminFirestore();
  const index: PbsCustomerIndexMaps = {
    byContactRef: new Map(),
    byVehicleRef: new Map(),
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
  }

  return index;
}

function resolveCustomerFromIndex(
  index: PbsCustomerIndexMaps,
  ro: PbsOpenRepairOrder
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
  return {};
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
  index: PbsCustomerIndexMaps
): OpenRepairOrderRow | null {
  if (!isOpenPbsRepairOrder(ro)) return null;

  const repairOrderId = (ro.RepairOrderId || '').trim();
  const roNumber = repairOrderSoNumber(ro);
  if (!repairOrderId || !roNumber) return null;

  const { customerId, customer } = resolveCustomerFromIndex(index, ro);
  const firstName = customer ? String(customer.firstName || '').trim() : '';
  const lastName = customer ? String(customer.lastName || '').trim() : '';
  const customerName = [firstName, lastName].filter(Boolean).join(' ') || undefined;
  const year = customer ? String(customer.year || '').trim() : '';
  const make = customer ? String(customer.make || '').trim() : '';
  const model = customer ? String(customer.model || '').trim() : '';
  const vehicleLabel = [year, make, model].filter(Boolean).join(' ') || undefined;
  const vin = customer ? String(customer.vin || '') : '';
  const vinLast8 = customer
    ? String(customer.vinLast8 || vinLast8FromVin(vin))
    : undefined;

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

export async function listOpenRepairOrdersForDealership(
  dealershipId: string = PBS_AUTOMATED_SYNC_DEALERSHIP_ID
): Promise<{ orders: OpenRepairOrderRow[]; fetchedAt: string }> {
  const [repairOrders, index] = await Promise.all([
    fetchOpenRepairOrdersFromPbs(),
    loadCustomerIndexForOpenRos(dealershipId),
  ]);

  const orders = repairOrders
    .map((ro) => mapOpenRepairOrderRow(ro, index))
    .filter((row): row is OpenRepairOrderRow => Boolean(row))
    .sort((a, b) => {
      const byDays = b.daysOpen - a.daysOpen;
      if (byDays !== 0) return byDays;
      return a.roNumber.localeCompare(b.roNumber);
    });

  return { orders, fetchedAt: new Date().toISOString() };
}
