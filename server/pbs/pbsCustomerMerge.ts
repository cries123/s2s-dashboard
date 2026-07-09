import { FieldValue } from 'firebase-admin/firestore';
import { normalizePhone } from './pbsMappers.js';
import { stripUndefinedDeep } from './pbsFirestore.js';
import type { PbsContactVehicle } from './pbsTypes.js';

/** Keep the newest PBS row when the same VIN appears more than once. */
export function dedupeContactVehiclesByVin(vehicles: PbsContactVehicle[]): PbsContactVehicle[] {
  const byVin = new Map<string, PbsContactVehicle>();

  for (const cv of vehicles) {
    const vin = (cv.VehicleVIN || '').replace(/\s/g, '').toUpperCase();
    if (!vin) continue;

    const prev = byVin.get(vin);
    if (!prev) {
      byVin.set(vin, cv);
      continue;
    }

    const prevTs =
      Date.parse(prev.VehicleLastUpdate || prev.ContactLastUpdate || '') ||
      Date.parse(prev.VehicleLastSaleDate || '') ||
      0;
    const nextTs =
      Date.parse(cv.VehicleLastUpdate || cv.ContactLastUpdate || '') ||
      Date.parse(cv.VehicleLastSaleDate || '') ||
      0;

    if (nextTs >= prevTs) byVin.set(vin, cv);
  }

  return Array.from(byVin.values());
}

/** True when PBS shows a different registered owner for the same vehicle. */
export function pbsOwnerIdentityChanged(
  existing: Record<string, unknown>,
  mapped: Record<string, unknown>
): boolean {
  const prevContact = String(existing.pbsContactId || '').trim();
  const nextContact = String(mapped.pbsContactId || '').trim();
  if (prevContact && nextContact && prevContact !== nextContact) return true;

  const prevPhone = normalizePhone(String(existing.phone || ''));
  const nextPhone = normalizePhone(String(mapped.phone || ''));
  if (prevPhone && nextPhone && prevPhone !== nextPhone) return true;

  const prevName = `${existing.firstName || ''} ${existing.lastName || ''}`.trim().toLowerCase();
  const nextName = `${mapped.firstName || ''} ${mapped.lastName || ''}`.trim().toLowerCase();
  if (prevName && nextName && prevName !== nextName) return true;

  return false;
}

export function buildPbsCustomerUpdatePatch(
  existing: Record<string, unknown>,
  mapped: Record<string, unknown>,
  startedAt: string
): { patch: Record<string, unknown>; ownerChanged: boolean } {
  const ownerChanged = pbsOwnerIdentityChanged(existing, mapped);

  const preserved = {
    enableServiceAlert: existing.enableServiceAlert ?? mapped.enableServiceAlert,
    serviceAlertTriggered: ownerChanged ? false : (existing.serviceAlertTriggered ?? false),
    serviceReminderDueDate: ownerChanged ? FieldValue.delete() : existing.serviceReminderDueDate,
    serviceAlertIntervalDays: existing.serviceAlertIntervalDays,
    serviceAlertBufferDays: existing.serviceAlertBufferDays,
    serviceAlertOverrideDate: ownerChanged ? FieldValue.delete() : existing.serviceAlertOverrideDate,
    stopAlertInfo: existing.stopAlertInfo,
    notes: existing.notes,
    soldByUserId: existing.soldByUserId,
    soldByUsername: existing.soldByUsername,
    salesman: existing.salesman,
    lastContactOutcome: ownerChanged ? FieldValue.delete() : existing.lastContactOutcome,
    lastContactUserId: ownerChanged ? FieldValue.delete() : existing.lastContactUserId,
    lastContactUsername: ownerChanged ? FieldValue.delete() : existing.lastContactUsername,
    lastServiceContact: ownerChanged ? FieldValue.delete() : existing.lastServiceContact,
    lastAcknowledgedCycle: ownerChanged ? 0 : (existing.lastAcknowledgedCycle ?? 0),
    addedBy: existing.addedBy,
    addedByUsername: existing.addedByUsername,
    createdAt: existing.createdAt,
    pbsSyncedAt: startedAt,
    ...(ownerChanged ? { pbsOwnerChangedAt: startedAt } : {}),
  };

  return {
    ownerChanged,
    patch: stripUndefinedDeep({
      ...mapped,
      ...preserved,
    }),
  };
}
