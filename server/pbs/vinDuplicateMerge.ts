import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { customersCollection, stripUndefinedDeep } from './pbsFirestore.js';
import { SERVICE_VISITS_COLLECTION, type StoredVisit } from '../../src/lib/visitStore.js';
import {
  groupCarsOnSeveralProfiles,
  planCarMerge,
  vinTail,
  type CarMergePlan,
  type DuplicateGroup,
  type ProfileForMerge,
  type SkippedGroup,
} from './vinDuplicatePlan.js';

/**
 * Merging one car's profiles, for real. The plan is vinDuplicatePlan.ts; this
 * file only reads, writes and checks.
 *
 * Each car is one transaction, so a car is either fully merged or untouched:
 *
 *   1. BACK UP  every profile in the group — the record, its stored visits and
 *               call notes — to customerMergeBackups (append-only, `create`).
 *   2. COPY     the merged profiles' visits (and the same person's call notes)
 *               onto the kept profile, each with `create`, so nothing existing
 *               is overwritten.
 *   3. UPDATE   the kept profile (car, owner, visit summary) and hide each
 *               merged profile with `mergedInto`. Its visits are copied, its old
 *               visit array and summary cleared, and any visit document it
 *               stores is marked `mergedInto` so reports skip the copy.
 *   4. VERIFY   after commit, by reading back: every copied visit is on the kept
 *               profile and every merged profile says where it went.
 *
 * Nothing is deleted. A visit is on the kept profile and in the backup.
 */

const BACKUPS = 'customerMergeBackups';
const CONTACT_LOG = 'contactLog';

function backupsCollection(db: Firestore) {
  return customersCollection(db).parent!.collection(BACKUPS);
}

/** Plan fields: null means delete. */
function toUpdate(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[k] = v === null ? FieldValue.delete() : v;
  return out;
}

/** Every profile in one store, small fields only, grouped by the car they share. */
export async function findCarsOnSeveralProfiles(
  db: Firestore,
  dealershipId: string
): Promise<{ groups: DuplicateGroup[]; skipped: SkippedGroup[]; profiles: number }> {
  const snap = await customersCollection(db)
    .where('dealershipId', '==', dealershipId)
    .select('vin', 'vinLast8', 'year', 'model', 'mergedInto')
    .get();
  const { groups, skipped } = groupCarsOnSeveralProfiles(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
  return { groups, skipped, profiles: snap.size };
}

type Reader = {
  get(ref: FirebaseFirestore.DocumentReference): Promise<DocumentSnapshot>;
  get(query: FirebaseFirestore.Query): Promise<FirebaseFirestore.QuerySnapshot>;
};

async function readGroup(db: Firestore, ids: readonly string[], reader: Reader) {
  const profiles: ProfileForMerge[] = [];
  const snaps = new Map<string, DocumentSnapshot>();
  const contactLogs = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
  for (const id of ids) {
    const ref = customersCollection(db).doc(id);
    const snap = await reader.get(ref);
    if (!snap.exists) throw new Error(`Profile ${id} no longer exists`);
    snaps.set(id, snap);
    const visits = await reader.get(ref.collection(SERVICE_VISITS_COLLECTION));
    const log = await reader.get(ref.collection(CONTACT_LOG));
    profiles.push({
      id,
      data: snap.data() as Record<string, unknown>,
      visitDocs: visits.docs.map((d) => ({ id: d.id, data: d.data() as StoredVisit })),
    });
    contactLogs.set(id, log.docs.map((d) => ({ id: d.id, data: d.data() })));
  }
  return { profiles, snaps, contactLogs };
}

/**
 * The group a request names must still be one car in this store. The browser
 * sends the groups it was shown; anything that changed since is refused here.
 */
function liveProfilesOf(group: DuplicateGroup, profiles: ProfileForMerge[], dealershipId: string): ProfileForMerge[] {
  const live = profiles.filter((p) => !p.data.mergedInto);
  if (live.some((p) => String(p.data.dealershipId || '') !== dealershipId)) {
    throw new Error('A profile in this group belongs to another store');
  }
  if (live.some((p) => vinTail(p.data) !== group.tail)) {
    throw new Error('These profiles no longer share this VIN');
  }
  return live;
}

export interface CarMergeResult {
  tail: string;
  status: 'merged' | 'planned' | 'skipped' | 'failed';
  reason?: string;
  plan?: CarMergePlan;
  /** Read back after commit. */
  verified?: boolean;
}

/** Preview one car: reads only. */
export async function previewCarMerge(
  db: Firestore,
  group: DuplicateGroup,
  now: string,
  dealershipId = 'hyundai'
): Promise<CarMergeResult> {
  try {
    const reader: Reader = { get: (x: any) => x.get() } as Reader;
    const { profiles } = await readGroup(db, group.ids, reader);
    const live = liveProfilesOf(group, profiles, dealershipId);
    if (live.length < 2) return { tail: group.tail, status: 'skipped', reason: 'Already merged' };
    return { tail: group.tail, status: 'planned', plan: planCarMerge(group.tail, live, now) };
  } catch (err) {
    return { tail: group.tail, status: 'failed', reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Merge one car, all or nothing, then read it back. */
export async function mergeCar(
  db: Firestore,
  group: DuplicateGroup,
  options: { dealershipId: string; now: string; runId: string }
): Promise<CarMergeResult> {
  let plan: CarMergePlan | undefined;
  try {
    const outcome = await db.runTransaction(async (tx) => {
      const { profiles, contactLogs } = await readGroup(db, group.ids, tx as unknown as Reader);
      const live = liveProfilesOf(group, profiles, options.dealershipId);
      if (live.length < 2) return 'already-merged' as const;
      plan = planCarMerge(group.tail, live, options.now);
      const keepRef = customersCollection(db).doc(plan.keepId);

      // 1. Back up every profile record, and everything a merged one stores.
      // The kept profile's own visits and notes are never changed, only added
      // to, and leaving them out keeps the backup under Firestore's 1 MiB.
      for (const p of live) {
        const kept = p.id === plan.keepId;
        tx.create(backupsCollection(db).doc(`${p.id}__${options.runId}`), {
          customerId: p.id,
          role: kept ? 'kept' : 'merged',
          keptId: plan.keepId,
          vinTail: group.tail,
          runId: options.runId,
          backedUpAt: options.now,
          record: p.data,
          ...(kept ? {} : { serviceVisits: p.visitDocs, contactLog: contactLogs.get(p.id) ?? [] }),
        });
      }

      // 2. Copy visits and the same person's call notes onto the kept profile.
      for (const c of plan.visitCopies) {
        tx.create(
          keepRef.collection(SERVICE_VISITS_COLLECTION).doc(c.docId),
          stripUndefinedDeep({
            ...c.visit,
            id: c.docId,
            customerId: plan.keepId,
            dealershipId: options.dealershipId,
            movedFromCustomerId: c.fromCustomerId,
            movedFromVisitId: c.fromVisitId,
            movedAt: options.now,
          })
        );
      }
      const keptLogIds = new Set((contactLogs.get(plan.keepId) ?? []).map((l) => l.id));
      for (const fromId of plan.copyContactLogFrom) {
        for (const l of contactLogs.get(fromId) ?? []) {
          let id = l.id;
          for (let n = 1; keptLogIds.has(id); n++) id = `${l.id}~${fromId.slice(0, 6)}${n > 1 ? `-${n}` : ''}`;
          keptLogIds.add(id);
          tx.create(keepRef.collection(CONTACT_LOG).doc(id), { ...l.data, movedFromCustomerId: fromId, movedAt: options.now });
        }
      }

      // 3. The kept profile, then each merged one.
      tx.update(keepRef, toUpdate(plan.keepPatch));
      for (const id of plan.mergeIds) {
        const ref = customersCollection(db).doc(id);
        tx.update(ref, toUpdate(plan.mergePatches[id]));
        const from = live.find((p) => p.id === id)!;
        for (const d of from.visitDocs) {
          const copy = plan.visitCopies.find((c) => c.fromCustomerId === id && c.fromVisitId === d.id);
          tx.update(ref.collection(SERVICE_VISITS_COLLECTION).doc(d.id), {
            mergedInto: plan.keepId,
            copiedTo: copy ? copy.docId : d.id,
          });
        }
      }
      return 'merged' as const;
    });

    if (outcome === 'already-merged') return { tail: group.tail, status: 'skipped', reason: 'Already merged' };

    // 4. Read it back.
    const p = plan!;
    const keepVisits = await customersCollection(db).doc(p.keepId).collection(SERVICE_VISITS_COLLECTION).select().get();
    const stored = new Set(keepVisits.docs.map((d) => d.id));
    const copiesThere = p.visitCopies.every((c) => stored.has(c.docId));
    const mergedThere = await Promise.all(
      p.mergeIds.map(async (id) => (await customersCollection(db).doc(id).get()).get('mergedInto') === p.keepId)
    );
    return { tail: group.tail, status: 'merged', plan: p, verified: copiesThere && mergedThere.every(Boolean) };
  } catch (err) {
    return { tail: group.tail, status: 'failed', plan, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** One car's outcome, as the Admin page shows it: names and counts, no visit detail. */
export interface CarMergeRow {
  tail: string;
  status: CarMergeResult['status'];
  reason?: string;
  vin?: string;
  keptId?: string;
  mergedIds?: string[];
  ownerName?: string;
  keptNameBefore?: string;
  mergedNames?: string[];
  ownerReason?: string;
  ownerChanged?: boolean;
  nameFilled?: boolean;
  phoneFilled?: boolean;
  visitsCopied?: number;
  verified?: boolean;
}

export function toCarMergeRow(r: CarMergeResult): CarMergeRow {
  const p = r.plan;
  return {
    tail: r.tail,
    status: r.status,
    ...(r.reason ? { reason: r.reason } : {}),
    ...(p
      ? {
          vin: p.vin || p.tail,
          keptId: p.keepId,
          mergedIds: p.mergeIds,
          ownerName: p.ownerName,
          keptNameBefore: p.keptNameBefore,
          mergedNames: p.mergedNames,
          ownerReason: p.ownerReason,
          ownerChanged: p.ownerChanged,
          nameFilled: 'lastName' in p.keepPatch,
          phoneFilled: 'phone' in p.keepPatch,
          visitsCopied: p.visitCopies.length,
        }
      : {}),
    ...(r.verified !== undefined ? { verified: r.verified } : {}),
  };
}

/** Most cars a request may name: each is its own transaction, inside the ~26 s gateway. */
export const CAR_MERGE_BATCH_LIMIT = { preview: 25, merge: 8 } as const;

/**
 * Preview or merge the cars a request names, one after another. The browser
 * gets the list once (findCarsOnSeveralProfiles) and sends it back a few cars
 * at a time, so the store's customers are read once per run, not per request.
 */
export async function runCarMergeBatch(
  db: Firestore,
  options: { dealershipId: string; groups: DuplicateGroup[]; dryRun: boolean; runId: string; now: string }
): Promise<CarMergeRow[]> {
  const limit = options.dryRun ? CAR_MERGE_BATCH_LIMIT.preview : CAR_MERGE_BATCH_LIMIT.merge;
  if (options.groups.length > limit) throw new Error(`At most ${limit} cars per request`);
  const rows: CarMergeRow[] = [];
  for (const group of options.groups) {
    const result = options.dryRun
      ? await previewCarMerge(db, group, options.now, options.dealershipId)
      : await mergeCar(db, group, { dealershipId: options.dealershipId, now: options.now, runId: options.runId });
    rows.push(toCarMergeRow(result));
  }
  return rows;
}
