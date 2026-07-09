import { FieldValue, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { PBS_AUTOMATED_SYNC_DEALERSHIP_ID } from './pbsDealershipScope.js';

/** @deprecated Use PBS_AUTOMATED_SYNC_DEALERSHIP_ID */
export const PBS_DEALERSHIP_ID = PBS_AUTOMATED_SYNC_DEALERSHIP_ID;

const DATA_ROOT = 'artifacts/hyundai-sales-to-service/public/data';

export function customersCollection(db: Firestore) {
  return db.collection(`${DATA_ROOT}/customers`);
}

export function appointmentTrackerCollection(db: Firestore) {
  return db.collection(`${DATA_ROOT}/appointmentTracker`);
}

export function dealershipSettingsDoc(db: Firestore, dealershipId: string) {
  return db.doc(`${DATA_ROOT}/dealershipSettings/${dealershipId}`);
}

export function advisorPerformanceDoc(db: Firestore, dealershipId: string) {
  const docId = dealershipId === 'hyundai' ? 'advisorReports' : `advisorReports_${dealershipId}`;
  return db.doc(`${DATA_ROOT}/performance/${docId}`);
}

export function technicianPerformanceDoc(db: Firestore, dealershipId: string) {
  const docId = dealershipId === 'hyundai' ? 'technicianReports' : `technicianReports_${dealershipId}`;
  return db.doc(`${DATA_ROOT}/performance/${docId}`);
}

export function dispatchOrdersCollection(db: Firestore) {
  return db.collection(`${DATA_ROOT}/dispatchOrders`);
}

export function vehicleInventoryCollection(db: Firestore) {
  return db.collection(`${DATA_ROOT}/vehicleInventory`);
}

export function dispatchOrderDocId(pbsRepairOrderId: string): string {
  return `pbs-ro-${pbsRepairOrderId}`;
}

export function inventoryVehicleDocId(vehicleId: string, vin?: string): string {
  const key = (vehicleId || vin || '').trim();
  return `pbs-${key}`;
}

export function appointmentTrackerDocId(dealershipId: string, date: string): string {
  return `${dealershipId}_${date}`;
}

export async function commitBatches(
  db: Firestore,
  writes: Array<(batch: WriteBatch) => void>,
  chunkSize = 400
): Promise<void> {
  for (let i = 0; i < writes.length; i += chunkSize) {
    const batch = db.batch();
    const slice = writes.slice(i, i + chunkSize);
    for (const apply of slice) {
      apply(batch);
    }
    await batch.commit();
  }
}

export function serverTimestamp() {
  return FieldValue.serverTimestamp();
}

/** Firestore rejects undefined field values — strip them before writes. */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** Recursively remove undefined values from nested maps (Firestore rejects them at any depth). */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof FieldValue) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  const ctorName = value.constructor?.name;
  if (ctorName && ctorName !== 'Object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child !== undefined) {
      out[key] = stripUndefinedDeep(child);
    }
  }
  return out as T;
}
