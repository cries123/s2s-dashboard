import type { Firestore } from 'firebase-admin/firestore';
import type { OpenRepairOrderRow } from './pbsOpenRepairOrders.js';

/**
 * Durable cache for the Open Repair Orders list.
 *
 * The in-memory cache in pbsOpenRepairOrders.ts only lives as long as one serverless
 * instance. On Netlify that is often seconds, so nearly every page open was a cold
 * load: a 90-day RepairOrderGet, two batched enrichment calls, and a full customer
 * scan — 10–30 seconds with a blank spinner.
 *
 * This stores the last good result in Firestore. A request serves it immediately
 * when it is fresh enough, and refreshes in the background when it is getting old.
 */

const DATA_ROOT = 'artifacts/hyundai-sales-to-service/public/data';

/** Serve straight from the snapshot without refreshing. */
export const OPEN_RO_SNAPSHOT_FRESH_MS = 3 * 60_000;
/** Serve the snapshot but kick off a background refresh. Beyond this, fetch live. */
export const OPEN_RO_SNAPSHOT_STALE_MS = 30 * 60_000;

export interface OpenRoSnapshot {
  dealershipId: string;
  orders: OpenRepairOrderRow[];
  fetchedAt: string;
}

export function openRoSnapshotDoc(db: Firestore, dealershipId: string) {
  return db.doc(`${DATA_ROOT}/openRoSnapshots/${dealershipId}`);
}

export async function readOpenRoSnapshot(
  db: Firestore,
  dealershipId: string
): Promise<OpenRoSnapshot | null> {
  try {
    const snap = await openRoSnapshotDoc(db, dealershipId).get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<OpenRoSnapshot> | undefined;
    if (!data || !Array.isArray(data.orders) || typeof data.fetchedAt !== 'string') return null;
    return { dealershipId, orders: data.orders as OpenRepairOrderRow[], fetchedAt: data.fetchedAt };
  } catch (err) {
    console.warn('[Open ROs] snapshot read failed:', err);
    return null;
  }
}

export async function writeOpenRoSnapshot(db: Firestore, snapshot: OpenRoSnapshot): Promise<void> {
  try {
    await openRoSnapshotDoc(db, snapshot.dealershipId).set({
      dealershipId: snapshot.dealershipId,
      orders: snapshot.orders,
      fetchedAt: snapshot.fetchedAt,
      count: snapshot.orders.length,
    });
  } catch (err) {
    console.warn('[Open ROs] snapshot write failed:', err);
  }
}

export function snapshotAgeMs(snapshot: OpenRoSnapshot, now = Date.now()): number {
  const t = Date.parse(snapshot.fetchedAt);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : now - t;
}
