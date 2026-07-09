import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { customerBelongsToPbsSyncDealership } from './pbsDealershipScope.js';
import {
  appointmentScheduleCollection,
  appointmentScheduleDocId,
  customersCollection,
  serverTimestamp,
  stripUndefinedDeep,
} from './pbsFirestore.js';
import {
  buildAppointmentCustomerLookup,
  buildAppointmentDisplayInfoMap,
  mapPbsAppointmentToSlot,
  type PbsAppointmentDisplayInfo,
  type ScheduledAppointmentSlot,
} from './pbsAppointmentSchedule.js';
import { pbsAppointmentPacificDate } from './pbsMappers.js';
import {
  pbsAppointmentContactVehicleInfoGet,
  pbsAppointmentGet,
} from './partnerHubClient.js';
import type { PbsAppointment, PbsAppointmentContactVehicleInfo } from './pbsTypes.js';

function monthBoundsForDate(date: string): { start: string; end: string } {
  const [year, month] = date.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const monthStr = String(month).padStart(2, '0');
  return {
    start: `${year}-${monthStr}-01`,
    end: `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

function appointmentCriteria(start: string, end: string): Record<string, unknown> {
  return {
    AppointmentSince: `${start}T00:00:00.0000000-07:00`,
    AppointmentUntil: `${end}T23:59:59.9999999-07:00`,
  };
}

async function loadCustomerIndex(db: Firestore, dealershipId: string) {
  const snap = await customersCollection(db).get();
  const byVehicleRef = new Map<string, string>();
  const byContactRef = new Map<string, string>();
  const dataById = new Map<string, DocumentData>();

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!customerBelongsToPbsSyncDealership(data, dealershipId)) continue;

    dataById.set(docSnap.id, data);

    const vehicleRef = String(data.pbsVehicleId || '').trim().toLowerCase();
    if (vehicleRef) byVehicleRef.set(vehicleRef, docSnap.id);

    const contactRef = String(data.pbsContactId || '').trim().toLowerCase();
    if (contactRef) byContactRef.set(contactRef, docSnap.id);
  }

  return { byVehicleRef, byContactRef, dataById };
}

async function fetchAppointmentDisplayInfo(
  start: string,
  end: string
): Promise<Map<string, PbsAppointmentDisplayInfo>> {
  const response = await pbsAppointmentContactVehicleInfoGet(appointmentCriteria(start, end));
  const items = (response.Items || []) as PbsAppointmentContactVehicleInfo[];
  return buildAppointmentDisplayInfoMap(items);
}

function slotsForDate(
  appointments: PbsAppointment[],
  date: string,
  lookup: ReturnType<typeof buildAppointmentCustomerLookup>,
  displayInfoByAppointmentId: Map<string, PbsAppointmentDisplayInfo>
): ScheduledAppointmentSlot[] {
  const slots: ScheduledAppointmentSlot[] = [];

  for (const appt of appointments) {
    const apptDate = pbsAppointmentPacificDate(appt.AppointmentTime, appt.AppointmentTimeUTC);
    if (apptDate !== date) continue;

    const slot = mapPbsAppointmentToSlot(appt, lookup, displayInfoByAppointmentId);
    if (slot) slots.push(slot);
  }

  return slots.sort((a, b) => a.startMinutes - b.startMinutes);
}

export async function getOrHydrateDaySchedule(
  db: Firestore,
  dealershipId: string,
  date: string,
  options: { forceRefresh?: boolean } = {}
): Promise<{
  appointments: ScheduledAppointmentSlot[];
  source: 'firestore' | 'pbs';
  hydrated: boolean;
}> {
  const docId = appointmentScheduleDocId(dealershipId, date);
  const ref = appointmentScheduleCollection(db).doc(docId);

  if (!options.forceRefresh) {
    const snap = await ref.get();
    if (snap.exists) {
      const appointments = (snap.data()?.appointments as ScheduledAppointmentSlot[] | undefined) ?? [];
      if (appointments.length > 0) {
        return { appointments, source: 'firestore', hydrated: false };
      }
    }
  }

  const { start, end } = monthBoundsForDate(date);
  const criteria = appointmentCriteria(start, end);
  const [appointmentResponse, displayInfoByAppointmentId] = await Promise.all([
    pbsAppointmentGet(criteria),
    fetchAppointmentDisplayInfo(start, end),
  ]);
  const appointments = (appointmentResponse.Appointments || []) as PbsAppointment[];
  const index = await loadCustomerIndex(db, dealershipId);
  const lookup = buildAppointmentCustomerLookup(index);
  const slots = slotsForDate(appointments, date, lookup, displayInfoByAppointmentId);
  const syncedAt = new Date().toISOString();

  await ref.set(
    stripUndefinedDeep({
      date,
      dealershipId,
      appointments: slots,
      source: 'pbs-sync',
      pbsSyncedAt: syncedAt,
      updatedAt: serverTimestamp(),
    }),
    { merge: false }
  );

  return { appointments: slots, source: 'pbs', hydrated: true };
}
