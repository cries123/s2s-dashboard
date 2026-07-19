import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { fetchOpenRepairOrdersFromPbs } from './pbsOpenRepairOrders.js';
import { mapPbsOpenRepairOrderToDispatch } from './pbsDispatchMapper.js';
import {
  commitBatches,
  dispatchOrderDocId,
  dispatchOrdersCollection,
  stripUndefinedDeep,
} from './pbsFirestore.js';
import type { PbsCustomerIndexMaps, PbsOpenRepairOrder } from './pbsExtendedTypes.js';
import { isOpenPbsRepairOrder } from './pbsTechnicianAggregator.js';

function preserveDispatchLane(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  if (!existing) return incoming;

  const existingDept = String(existing.department || 'unassigned');
  if (existingDept !== 'unassigned') {
    return {
      ...incoming,
      department: existing.department,
      currentLaneId: existing.currentLaneId || existing.department,
      lifecycleStatus: existing.lifecycleStatus || incoming.lifecycleStatus,
      isWaiting: existing.isWaiting ?? incoming.isWaiting,
      isPdl: existing.isPdl ?? incoming.isPdl,
    };
  }

  return incoming;
}

async function loadExistingPbsDispatchDocs(
  db: Firestore,
  dealershipId: string
): Promise<Map<string, Record<string, unknown>>> {
  const snap = await dispatchOrdersCollection(db)
    .where('dealershipId', '==', dealershipId)
    .where('source', '==', 'pbs-sync')
    .get();

  const byId = new Map<string, Record<string, unknown>>();
  for (const docSnap of snap.docs) {
    if (!docSnap.id.startsWith('pbs-ro-')) continue;
    byId.set(docSnap.id, docSnap.data());
  }
  return byId;
}

export async function syncPbsDispatchBoard(
  db: Firestore,
  dealershipId: string,
  index: PbsCustomerIndexMaps,
  syncedAt: string
): Promise<{
  openRepairOrdersFetched: number;
  dispatchOrdersUpserted: number;
  dispatchOrdersCompleted: number;
}> {
  const [repairOrders, existingById] = await Promise.all([
    fetchOpenRepairOrdersFromPbs(),
    loadExistingPbsDispatchDocs(db, dealershipId),
  ]);

  const openOrders = repairOrders.filter(isOpenPbsRepairOrder);
  const activePbsDocIds = new Set<string>();
  const upsertWrites: Array<(batch: WriteBatch) => void> = [];

  for (const ro of openOrders) {
    const mapped = mapPbsOpenRepairOrderToDispatch(ro, dealershipId, syncedAt, index);
    if (!mapped) continue;

    const repairOrderId = String(mapped.pbsRepairOrderId || ro.RepairOrderId || '').trim();
    if (!repairOrderId) continue;

    const docId = dispatchOrderDocId(repairOrderId);
    activePbsDocIds.add(docId);

    const ref = dispatchOrdersCollection(db).doc(docId);
    const existing = existingById.get(docId);
    const merged = preserveDispatchLane(existing, mapped);

    upsertWrites.push((batch) => batch.set(ref, stripUndefinedDeep(merged), { merge: true }));
    existingById.set(docId, merged);
  }

  await commitBatches(db, upsertWrites, 200);

  const completeWrites: Array<(batch: WriteBatch) => void> = [];

  for (const [docId, data] of existingById) {
    if (activePbsDocIds.has(docId)) continue;
    if (data.isCompleted === true) continue;

    const ref = dispatchOrdersCollection(db).doc(docId);
    completeWrites.push((batch) =>
      batch.set(
        ref,
        stripUndefinedDeep({
          isCompleted: true,
          lastUpdated: syncedAt,
          pbsSyncedAt: syncedAt,
          pbsClosedAt: syncedAt,
        }),
        { merge: true }
      )
    );
  }

  await commitBatches(db, completeWrites);

  console.log(
    `[PBS Sync] Dispatch board: ${openOrders.length} open ROs (${repairOrders.length} fetched), ${activePbsDocIds.size} upserted, ${completeWrites.length} marked completed`
  );

  return {
    openRepairOrdersFetched: repairOrders.length,
    dispatchOrdersUpserted: activePbsDocIds.size,
    dispatchOrdersCompleted: completeWrites.length,
  };
}
