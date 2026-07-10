import type { DocumentData, Firestore, WriteBatch } from 'firebase-admin/firestore';
import {
  appointmentConcernText,
  categorizeAppointmentText,
  defaultScheduleStartMinutes,
  formatPacificTimeLabel,
  isActivePbsAppointment,
  pbsAppointmentPacificDate,
  pbsAppointmentToPacificMinutes,
} from './pbsMappers.js';
import {
  appointmentScheduleCollection,
  appointmentScheduleDocId,
  commitBatches,
  serverTimestamp,
  stripUndefinedDeep,
} from './pbsFirestore.js';
import type { PbsAppointment, PbsAppointmentContactVehicleInfo } from './pbsTypes.js';

export interface ScheduledAppointmentSlot {
  id: string;
  appointmentNumber: string;
  startMinutes: number;
  durationMinutes: number;
  techNumber: string;
  advisor: string;
  customerName: string;
  vehicleLabel: string;
  status: string;
  concern: string;
  category: 'diagnosis' | 'oilChange' | 'recall' | 'misc';
  isWaiter: boolean;
  pickupTimeLabel?: string;
}

export interface PbsAppointmentDisplayInfo {
  contactFirstName?: string;
  contactLastName?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
}

export interface AppointmentCustomerLookup {
  resolveCustomer: (
    contactRef?: string,
    vehicleRef?: string
  ) => { customerName: string; vehicleLabel: string };
}

function normalizePbsRef(ref?: string): string {
  return (ref || '').trim().toLowerCase();
}

function appointmentLookupKey(appt: PbsAppointment): string {
  return String(appt.AppointmentId || appt.Id || '').trim().toLowerCase();
}

export function formatPbsScheduleCustomerName(first?: string, last?: string): string {
  const firstName = (first || '').trim();
  const lastName = (last || '').trim();
  if (lastName && firstName) return `${lastName}, ${firstName}`.toUpperCase();
  return (lastName || firstName || '').toUpperCase();
}

export function formatPbsScheduleVehicleLabel(
  year?: string,
  make?: string,
  model?: string
): string {
  return [year, make, model].filter(Boolean).join(' ').toUpperCase();
}

export function buildAppointmentDisplayInfoMap(
  items: PbsAppointmentContactVehicleInfo[]
): Map<string, PbsAppointmentDisplayInfo> {
  const map = new Map<string, PbsAppointmentDisplayInfo>();
  for (const item of items) {
    const id = String(item.AppointmentId || '').trim().toLowerCase();
    if (!id) continue;
    map.set(id, {
      contactFirstName: item.ContactFirstName,
      contactLastName: item.ContactLastName,
      vehicleYear: item.VehicleYear,
      vehicleMake: item.VehicleMake,
      vehicleModel: item.VehicleModel,
    });
  }
  return map;
}

export function buildAppointmentCustomerLookup(index: {
  byVehicleRef: Map<string, string>;
  byContactRef: Map<string, string>;
  dataById: Map<string, DocumentData>;
}): AppointmentCustomerLookup {
  return {
    resolveCustomer(contactRef?: string, vehicleRef?: string) {
      let customerId: string | undefined;
      const normalizedVehicleRef = normalizePbsRef(vehicleRef);
      const normalizedContactRef = normalizePbsRef(contactRef);
      if (normalizedVehicleRef) customerId = index.byVehicleRef.get(normalizedVehicleRef);
      if (!customerId && normalizedContactRef) {
        customerId = index.byContactRef.get(normalizedContactRef);
      }

      const data = customerId ? index.dataById.get(customerId) : undefined;
      const first = String(data?.firstName || '').trim();
      const last = String(data?.lastName || '').trim();
      const customerName =
        last && first
          ? `${last}, ${first}`.toUpperCase()
          : (last || first || '').toUpperCase();
      const vehicleLabel = [data?.year, data?.make, data?.model]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();

      return { customerName, vehicleLabel };
    },
  };
}

function pickTechNumber(appt: PbsAppointment): string {
  for (const line of appt.RequestLines || []) {
    const tech = (line.Tech || '').trim();
    if (tech) return tech;
  }
  return '';
}

function pickDurationMinutes(appt: PbsAppointment): number {
  let maxHours = 0;
  for (const line of appt.RequestLines || []) {
    const hours = Number(line.AllowedHours);
    if (Number.isFinite(hours) && hours > maxHours) maxHours = hours;
  }
  if (maxHours > 0) return Math.max(30, Math.round(maxHours * 60));
  return 60;
}

function resolveDisplayFields(
  appt: PbsAppointment,
  lookup: AppointmentCustomerLookup,
  displayInfoByAppointmentId?: Map<string, PbsAppointmentDisplayInfo>
): { customerName: string; vehicleLabel: string } {
  const inline = displayInfoByAppointmentId?.get(appointmentLookupKey(appt));
  const inlineName = formatPbsScheduleCustomerName(
    inline?.contactFirstName,
    inline?.contactLastName
  );
  const inlineVehicle = formatPbsScheduleVehicleLabel(
    inline?.vehicleYear,
    inline?.vehicleMake,
    inline?.vehicleModel
  );

  if (inlineName) {
    return {
      customerName: inlineName,
      vehicleLabel: inlineVehicle || 'VEHICLE',
    };
  }

  const fromIndex = lookup.resolveCustomer(appt.ContactRef, appt.VehicleRef);
  return {
    customerName: fromIndex.customerName || 'CUSTOMER',
    vehicleLabel: fromIndex.vehicleLabel || 'VEHICLE',
  };
}

export function mapPbsAppointmentToSlot(
  appt: PbsAppointment,
  lookup: AppointmentCustomerLookup,
  displayInfoByAppointmentId?: Map<string, PbsAppointmentDisplayInfo>
): ScheduledAppointmentSlot | null {
  if (!isActivePbsAppointment(appt)) return null;

  let startMinutes = pbsAppointmentToPacificMinutes(
    appt.AppointmentTime,
    appt.AppointmentTimeUTC
  );
  if (startMinutes === null && (appt.AppointmentTime || appt.AppointmentTimeUTC)) {
    startMinutes = defaultScheduleStartMinutes();
  }
  if (startMinutes === null) return null;

  const concern = appointmentConcernText(appt);
  const category = categorizeAppointmentText(concern || 'misc');
  const firstLine = appt.RequestLines?.[0];
  const advisor = (appt.Advisor || firstLine?.CSR || '').trim();
  const { customerName, vehicleLabel } = resolveDisplayFields(
    appt,
    lookup,
    displayInfoByAppointmentId
  );

  const pickupIso = appt.PickupTime || appt.PickupTimeUTC;
  const pickupTimeLabel = formatPacificTimeLabel(pickupIso) || undefined;

  const id = String(
    appt.AppointmentId ||
      appt.Id ||
      appt.RawAppointmentNumber ||
      appt.AppointmentNumber ||
      `${appt.ContactRef || 'appt'}-${appt.AppointmentTime || appt.AppointmentTimeUTC || 'unknown'}`
  ).trim();
  if (!id) return null;

  return {
    id,
    appointmentNumber: String(appt.RawAppointmentNumber || appt.AppointmentNumber || id),
    startMinutes,
    durationMinutes: pickDurationMinutes(appt),
    techNumber: pickTechNumber(appt),
    advisor,
    customerName,
    vehicleLabel,
    status: (appt.Status || 'Open').trim(),
    concern: concern.slice(0, 160),
    category,
    isWaiter: Boolean(appt.IsWaiter),
    pickupTimeLabel,
  };
}

export async function syncAppointmentSchedule(
  db: Firestore,
  dealershipId: string,
  appointments: PbsAppointment[],
  monthStart: string,
  monthEnd: string,
  lookup: AppointmentCustomerLookup,
  syncedAt: string,
  displayInfoByAppointmentId?: Map<string, PbsAppointmentDisplayInfo>
): Promise<{ daysWritten: number; slotsWritten: number }> {
  const byDate = new Map<string, ScheduledAppointmentSlot[]>();

  for (const appt of appointments) {
    const date = pbsAppointmentPacificDate(appt.AppointmentTime, appt.AppointmentTimeUTC);
    if (!date || date < monthStart || date > monthEnd) continue;

    const slot = mapPbsAppointmentToSlot(appt, lookup, displayInfoByAppointmentId);
    if (!slot) continue;

    const list = byDate.get(date) || [];
    list.push(slot);
    byDate.set(date, list);
  }

  const [startYear, startMonth] = monthStart.split('-').map(Number);
  const [endYear, endMonth, endDay] = monthEnd.split('-').map(Number);
  const cursor = new Date(startYear, startMonth - 1, 1);
  const monthEndDate = new Date(endYear, endMonth - 1, endDay);

  const writes: Array<(batch: WriteBatch) => void> = [];
  let daysWritten = 0;
  let slotsWritten = 0;

  while (cursor <= monthEndDate) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const slots = (byDate.get(date) || []).sort((a, b) => a.startMinutes - b.startMinutes);
    const docId = appointmentScheduleDocId(dealershipId, date);
    const ref = appointmentScheduleCollection(db).doc(docId);

    writes.push((batch) =>
      batch.set(
        ref,
        stripUndefinedDeep({
          date,
          dealershipId,
          appointments: slots,
          source: 'pbs-sync',
          pbsSyncedAt: syncedAt,
          updatedAt: serverTimestamp(),
        }),
        { merge: false }
      )
    );

    daysWritten += 1;
    slotsWritten += slots.length;
    cursor.setDate(cursor.getDate() + 1);
  }

  await commitBatches(db, writes);

  console.log(
    `[PBS Sync] Appointment schedule written: ${slotsWritten} slots across ${daysWritten} days (${monthStart}..${monthEnd})`
  );

  return { daysWritten, slotsWritten };
}
