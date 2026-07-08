import { FieldValue, type Firestore, type WriteBatch } from 'firebase-admin/firestore';

export const PBS_DEALERSHIP_ID = 'hyundai';

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
