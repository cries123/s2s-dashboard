import { pbsContactVehicleGet, pbsContactVehicleItems } from './partnerHubClient.js';
import { normalizePbsRef } from './pbsAppointmentSchedule.js';
import type { PbsContactVehicle } from './pbsTypes.js';

export interface PbsRefDisplayInfo {
  firstName?: string;
  lastName?: string;
  year?: string;
  make?: string;
  model?: string;
  vin?: string;
}

const BATCH_SIZE = 100;

function mapContactVehicleRow(cv: PbsContactVehicle): PbsRefDisplayInfo {
  return {
    firstName: (cv.ContactFirstName || '').trim() || undefined,
    lastName: (cv.ContactLastName || '').trim() || undefined,
    year: (cv.VehicleYear || '').trim() || undefined,
    make: (cv.VehicleMake || '').trim() || undefined,
    model: (cv.VehicleModel || '').trim() || undefined,
    vin: (cv.VehicleVIN || '').replace(/\s/g, '').toUpperCase() || undefined,
  };
}

async function fetchContactVehicleBatch(criteria: Record<string, unknown>): Promise<PbsContactVehicle[]> {
  try {
    const response = await pbsContactVehicleGet({ IncludeInactive: true, ...criteria });
    return pbsContactVehicleItems(response) as PbsContactVehicle[];
  } catch (err) {
    console.warn(
      '[PBS] ContactVehicleGet fallback batch failed:',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * Batch-fetch customer + vehicle display fields by PBS vehicle/contact refs.
 * Tolerant of API errors — returns what it can.
 */
export async function fetchContactVehicleDisplayByRefs(
  vehicleRefs: string[],
  contactRefs: string[]
): Promise<{ byVehicleRef: Map<string, PbsRefDisplayInfo>; byContactRef: Map<string, PbsRefDisplayInfo> }> {
  const byVehicleRef = new Map<string, PbsRefDisplayInfo>();
  const byContactRef = new Map<string, PbsRefDisplayInfo>();

  const uniqueVehicleRefs = [...new Set(vehicleRefs.map((ref) => ref.trim()).filter(Boolean))];
  for (let i = 0; i < uniqueVehicleRefs.length; i += BATCH_SIZE) {
    const batch = uniqueVehicleRefs.slice(i, i + BATCH_SIZE);
    const rows = await fetchContactVehicleBatch({ VehicleIdList: batch });
    for (const cv of rows) {
      const vehicleKey = normalizePbsRef(String(cv.VehicleId || ''));
      const contactKey = normalizePbsRef(String(cv.ContactId || ''));
      const info = mapContactVehicleRow(cv);
      if (vehicleKey) byVehicleRef.set(vehicleKey, info);
      if (contactKey) byContactRef.set(contactKey, info);
    }
  }

  const uniqueContactRefs = [...new Set(contactRefs.map((ref) => ref.trim()).filter(Boolean))];
  const missingContacts = uniqueContactRefs.filter((ref) => !byContactRef.has(normalizePbsRef(ref)));
  for (let i = 0; i < missingContacts.length; i += BATCH_SIZE) {
    const batch = missingContacts.slice(i, i + BATCH_SIZE);
    const rows = await fetchContactVehicleBatch({ ContactIdList: batch });
    for (const cv of rows) {
      const contactKey = normalizePbsRef(String(cv.ContactId || ''));
      const vehicleKey = normalizePbsRef(String(cv.VehicleId || ''));
      const info = mapContactVehicleRow(cv);
      if (contactKey && !byContactRef.has(contactKey)) byContactRef.set(contactKey, info);
      if (vehicleKey && !byVehicleRef.has(vehicleKey)) byVehicleRef.set(vehicleKey, info);
    }
  }

  return { byVehicleRef, byContactRef };
}

export function formatPbsDisplayName(info?: PbsRefDisplayInfo): string | undefined {
  if (!info) return undefined;
  const first = (info.firstName || '').trim();
  const last = (info.lastName || '').trim();
  const full = [first, last].filter(Boolean).join(' ');
  return full ? full.toUpperCase() : undefined;
}

export function formatPbsVehicleLabel(info?: PbsRefDisplayInfo): string | undefined {
  if (!info) return undefined;
  const label = [info.year, info.make, info.model].filter(Boolean).join(' ').trim();
  return label || undefined;
}
