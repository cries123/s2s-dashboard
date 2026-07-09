import type { DocumentData, Firestore, WriteBatch } from 'firebase-admin/firestore';
import {
  appointmentConcernText,
  categorizeAppointmentText,
  formatPacificTimeLabel,
  isActivePbsAppointment,
  pbsIsoToDateString,
  pbsIsoToPacificMinutes,
} from './pbsMappers.js';
import {
  appointmentScheduleCollection,
  appointmentScheduleDocId,
  commitBatches,
  serverTimestamp,
  stripUndefinedDeep,
} from './pbsFirestore.js';
import type { PbsAppointment } from './pbsTypes.js';

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

export interface AppointmentCustomerLookup {
  resolveCustomer: (
    contactRef?: string,
    vehicleRef?: string
  ) => { customerName: string; vehicleLabel: string };
}

export function buildAppointmentCustomerLookup(index: {
  byVehicleRef: Map<string, string>;
  byContactRef: Map<string, string>;
  dataById: Map<string, DocumentData>;
}): AppointmentCustomerLookup {
  return {
    resolveCustomer(contactRef?: string, vehicleRef?: string) {
      let customerId: string | undefined;
      if (vehicleRef) customerId = index.byVehicleRef.get(vehicleRef);
      if (!customerId && contactRef) customerId = index.byContactRef.get(contactRef);

      const data = customerId ? index.dataById.get(customerId) : undefined;
      const first = String(data?.firstName || '').trim();
      const last = String(data?.lastName || '').trim();
      const customerName =
        last && first
          ? `${last}, ${first}`.toUpperCase()
          : (last || first || 'CUSTOMER').toUpperCase();
      const vehicleLabel = [data?.year, data?.make, data?.model]
        .filter(Boolean)
        .join(' ')
        .toUpperCase() || 'VEHICLE';

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

export function mapPbsAppointmentToSlot(
  appt: PbsAppointment,
  lookup: AppointmentCustomerLookup
): ScheduledAppointmentSlot | null {
  if (!isActivePbsAppointment(appt)) return null;

  const timeIso = appt.AppointmentTime || appt.AppointmentTimeUTC;
  const startMinutes = pbsIsoToPacificMinutes(timeIso);
  if (startMinutes === null) return null;

  const concern = appointmentConcernText(appt);
  const category = categorizeAppointmentText(concern || 'misc');
  const firstLine = appt.RequestLines?.[0];
  const advisor = (appt.Advisor || firstLine?.CSR || '').trim();
  const { customerName, vehicleLabel } = lookup.resolveCustomer(
    appt.ContactRef,
    appt.VehicleRef
  );

  const pickupIso = appt.PickupTime || appt.PickupTimeUTC;
  const pickupTimeLabel = formatPacificTimeLabel(pickupIso) || undefined;

  const id =
    (appt.AppointmentId || appt.Id || appt.RawAppointmentNumber || String(appt.AppointmentNumber || '')).trim();
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
  syncedAt: string
): Promise<{ daysWritten: number; slotsWritten: number }> {
  const byDate = new Map<string, ScheduledAppointmentSlot[]>();

  for (const appt of appointments) {
    const timeIso = appt.AppointmentTime || appt.AppointmentTimeUTC;
    const date =
      pbsIsoToDateString(timeIso) ||
      pbsIsoToDateString(appt.AppointmentTimeUTC);
    if (!date || date < monthStart || date > monthEnd) continue;

    const slot = mapPbsAppointmentToSlot(appt, lookup);
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
