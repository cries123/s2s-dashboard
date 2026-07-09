import { categorizeAppointmentBlock } from '../dms/parsers/appointments.js';
import { stripUndefinedDeep } from './pbsFirestore.js';
import type { PbsAppointment, PbsContactVehicle, PbsRepairOrder } from './pbsTypes.js';

const PACIFIC_TZ = 'America/Los_Angeles';
const DEFAULT_SCHEDULE_START_MINUTES = 9 * 60;

/** PBS timestamps use 7-digit fractional seconds — normalize for Date parsing. */
export function parsePbsIso(iso: string | undefined | null): Date | null {
  if (!iso || iso.startsWith('0001-01-01')) return null;
  const normalized = iso.replace(/(\.\d{3})\d+/, '$1');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

export function vinLast8FromVin(vin: string | undefined | null): string {
  if (!vin) return '';
  const cleaned = vin.replace(/\s/g, '').toUpperCase();
  return cleaned.length >= 8 ? cleaned.slice(-8) : cleaned;
}

/** PBS ISO timestamps → YYYY-MM-DD in dealership local time. */
export function pbsIsoToDateString(iso: string | undefined | null): string | null {
  const d = parsePbsIso(iso);
  if (!d) return null;
  return d.toLocaleDateString('en-CA', { timeZone: PACIFIC_TZ });
}

/** Minutes from midnight Pacific for scheduler positioning. */
export function pbsIsoToPacificMinutes(iso: string | undefined | null): number | null {
  const d = parsePbsIso(iso);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function hasExplicitTimezoneOffset(iso: string): boolean {
  return /[+-]\d{2}:\d{2}$/.test(iso.replace(/\.\d+/, ''));
}

/** PBS AppointmentTime with only a Z suffix is dealership wall clock, not UTC. */
export function pbsWallClockPacificMinutes(iso: string | undefined | null): number | null {
  const d = parsePbsIso(iso);
  if (!d) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function pbsWallClockPacificDate(iso: string | undefined | null): string | null {
  if (!iso || iso.startsWith('0001-01-01')) return null;
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

/**
 * Resolve appointment start time for the schedule board.
 * Prefer true UTC (AppointmentTimeUTC), then offset-aware local, then wall-clock Z.
 */
export function pbsAppointmentToPacificMinutes(
  appointmentTime?: string | null,
  appointmentTimeUtc?: string | null
): number | null {
  if (appointmentTimeUtc && !appointmentTimeUtc.startsWith('0001-01-01')) {
    const fromUtc = pbsIsoToPacificMinutes(appointmentTimeUtc);
    if (fromUtc !== null) return fromUtc;
  }

  if (!appointmentTime || appointmentTime.startsWith('0001-01-01')) return null;

  if (hasExplicitTimezoneOffset(appointmentTime)) {
    return pbsIsoToPacificMinutes(appointmentTime);
  }

  return pbsWallClockPacificMinutes(appointmentTime);
}

/** Pacific calendar date for an appointment (day bucket). */
export function pbsAppointmentPacificDate(
  appointmentTime?: string | null,
  appointmentTimeUtc?: string | null
): string | null {
  if (appointmentTimeUtc && !appointmentTimeUtc.startsWith('0001-01-01')) {
    const fromUtc = pbsIsoToDateString(appointmentTimeUtc);
    if (fromUtc) return fromUtc;
  }

  if (!appointmentTime || appointmentTime.startsWith('0001-01-01')) return null;

  if (hasExplicitTimezoneOffset(appointmentTime)) {
    return pbsIsoToDateString(appointmentTime);
  }

  return pbsWallClockPacificDate(appointmentTime);
}

export function defaultScheduleStartMinutes(): number {
  return DEFAULT_SCHEDULE_START_MINUTES;
}

export function formatPacificTimeLabel(iso: string | undefined | null): string | null {
  const d = parsePbsIso(iso);
  if (!d) return null;
  return d.toLocaleTimeString('en-US', {
    timeZone: PACIFIC_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function pickContactPhone(cv: PbsContactVehicle): string {
  const candidates = [cv.ContactCellPhone, cv.ContactHomePhone, cv.ContactBusinessPhone];
  for (const raw of candidates) {
    const normalized = normalizePhone(raw);
    if (normalized.length >= 10) {
      const formatted = raw?.trim();
      return formatted || normalized;
    }
  }
  return '';
}

/** PBS often omits first name for businesses — avoid storing "Unknown" before the real name. */
export function mapPbsContactName(cv: PbsContactVehicle): { firstName: string; lastName: string } {
  const first = (cv.ContactFirstName || '').trim();
  const last = (cv.ContactLastName || '').trim();
  const firstIsPlaceholder = !first || first.toLowerCase() === 'unknown';

  if (firstIsPlaceholder && last) {
    return { firstName: '', lastName: last };
  }
  if (first && !last) {
    return { firstName: first, lastName: '' };
  }
  if (firstIsPlaceholder && !last) {
    return { firstName: '', lastName: 'Customer' };
  }
  return { firstName: first, lastName: last };
}

export function mapContactVehicleToCustomerFields(
  cv: PbsContactVehicle,
  dealershipId: string
): Record<string, unknown> {
  const vin = (cv.VehicleVIN || '').replace(/\s/g, '').toUpperCase();
  const vinLast8 = vinLast8FromVin(vin);
  const { firstName, lastName } = mapPbsContactName(cv);
  const mileage =
    cv.VehicleOdometer && cv.VehicleOdometer > 0
      ? String(cv.VehicleOdometer)
      : cv.VehicleLastServiceMileage && cv.VehicleLastServiceMileage > 0
        ? String(cv.VehicleLastServiceMileage)
        : undefined;

  const lastServiceDate = pbsIsoToDateString(cv.VehicleLastServiceDate) ?? undefined;
  const soldDate = pbsIsoToDateString(cv.VehicleLastSaleDate) ?? '';

  return stripUndefinedDeep({
    firstName,
    lastName: lastName || 'Customer',
    phone: pickContactPhone(cv),
    email: (cv.ContactEmailAddress || '').trim(),
    address: cv.ContactAddress?.trim() || undefined,
    city: cv.ContactCity?.trim() || undefined,
    state: cv.ContactState?.trim() || undefined,
    zip: cv.ContactZipCode?.trim() || undefined,
    make: cv.VehicleMake?.trim() || 'Hyundai',
    model: cv.VehicleModel?.trim() || 'Unknown',
    year: cv.VehicleYear?.trim() || undefined,
    vin: vin || undefined,
    vinLast8,
    mileage,
    lastServiceDate,
    soldDate,
    dealershipId,
    pbsContactId: cv.ContactId || undefined,
    pbsVehicleId: cv.VehicleId || undefined,
    language: 'English',
    enableServiceAlert: true,
    serviceAlertTriggered: false,
    lastAcknowledgedCycle: 0,
  });
}

export function repairOrderSoNumber(ro: PbsRepairOrder): string {
  const raw = ro.RawRepairOrderNumber || ro.RepairOrderNumber;
  if (raw === undefined || raw === null || raw === '') return '';
  return String(raw).replace(/^SO/i, '').trim();
}

export function isPbsImportedServiceVisit(visit: { id?: unknown }): boolean {
  return String(visit.id || '').startsWith('pbs-');
}

/** Keep manual visits and PBS visits for this vehicle only. */
export function mergeVehiclePbsServiceVisits(
  existing: Array<Record<string, unknown>> | undefined,
  incoming: Array<Record<string, unknown>>,
  vehicleRef: string,
  maxVisits = 25
): Array<Record<string, unknown>> {
  const normalizedVehicleRef = vehicleRef.trim();
  const refreshingVehicle = incoming.length > 0;

  const retainedExisting = (existing || []).filter((visit) => {
    if (!isPbsImportedServiceVisit(visit)) return true;

    const visitVehicleRef = String(visit.pbsVehicleRef || '').trim();
    if (!visitVehicleRef) {
      // Legacy PBS rows (pre vehicle-only matching) — drop when this vehicle is being refreshed.
      return !refreshingVehicle;
    }

    return visitVehicleRef === normalizedVehicleRef;
  });

  return mergeServiceVisits(retainedExisting, incoming, maxVisits);
}

export function mapRepairOrderToVisit(ro: PbsRepairOrder): {
  soNumber: string;
  date: string;
  mileage: number;
  advisor: string;
  requests: string;
} | null {
  const soNumber = repairOrderSoNumber(ro);
  if (!soNumber) return null;

  const date =
    pbsIsoToDateString(ro.DateCashiered) ||
    pbsIsoToDateString(ro.DateOpened) ||
    null;
  if (!date) return null;

  const mileage = ro.MileageOut || ro.MileageIn || 0;
  const requests =
    (ro.Requests || [])
      .map((r) => r.RequestDescription?.trim())
      .filter(Boolean)
      .join('; ') || 'Service visit';

  return {
    soNumber,
    date,
    mileage,
    advisor: (ro.CSR || '').trim(),
    requests,
  };
}

export function categorizeAppointmentText(text: string): 'recall' | 'oilChange' | 'diagnosis' | 'misc' {
  return categorizeAppointmentBlock(text.toUpperCase());
}

export function appointmentConcernText(appt: PbsAppointment): string {
  return (appt.RequestLines || [])
    .map((line) => line.RequestDescription?.trim())
    .filter(Boolean)
    .join(' ');
}

export function isActivePbsAppointment(appt: PbsAppointment): boolean {
  const status = (appt.Status || '').toLowerCase();
  if (!status) return true;
  return !status.includes('cancel') && !status.includes('delete');
}

export interface DailyAppointmentBreakdown {
  date: string;
  count: number;
  breakdown: { diagnosis: number; oilChange: number; recall: number; misc: number };
}

export function aggregateAppointmentsByDay(
  appointments: PbsAppointment[],
  monthStart: string,
  monthEnd: string
): DailyAppointmentBreakdown[] {
  const byDate = new Map<string, DailyAppointmentBreakdown>();

  for (const appt of appointments) {
    if (!isActivePbsAppointment(appt)) continue;

    const date =
      pbsAppointmentPacificDate(appt.AppointmentTime, appt.AppointmentTimeUTC);
    if (!date || date < monthStart || date > monthEnd) continue;

    const concern = appointmentConcernText(appt);
    const category = categorizeAppointmentText(concern || 'misc');

    let row = byDate.get(date);
    if (!row) {
      row = {
        date,
        count: 0,
        breakdown: { diagnosis: 0, oilChange: 0, recall: 0, misc: 0 },
      };
      byDate.set(date, row);
    }

    row.count += 1;
    row.breakdown[category] += 1;
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeServiceVisits(
  existing: Array<Record<string, unknown>> | undefined,
  incoming: Array<Record<string, unknown>>,
  maxVisits = 25
): Array<Record<string, unknown>> {
  const bySo = new Map<string, Record<string, unknown>>();

  for (const visit of existing || []) {
    const so = String(visit.soNumber || '');
    if (so) bySo.set(so, visit);
  }

  for (const visit of incoming) {
    const so = String(visit.soNumber || '');
    if (!so) continue;
    const prev = bySo.get(so);
    if (!prev) {
      bySo.set(so, visit);
      continue;
    }
    const prevDate = String(prev.date || '');
    const nextDate = String(visit.date || '');
    if (nextDate >= prevDate) {
      bySo.set(so, { ...prev, ...visit });
    }
  }

  return Array.from(bySo.values())
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, maxVisits);
}

export function latestVisitDate(visits: Array<{ date?: string }>): string | undefined {
  let latest: string | undefined;
  for (const v of visits) {
    if (v.date && (!latest || v.date > latest)) latest = v.date;
  }
  return latest;
}
