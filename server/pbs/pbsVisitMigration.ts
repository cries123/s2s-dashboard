import {
  FieldPath,
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { customersCollection, stripUndefinedDeep } from './pbsFirestore.js';
import {
  assignVisitDocIds,
  buildVisitSummary,
  newerLast,
  planVisitMigration,
  SERVICE_VISITS_COLLECTION,
  summarizeVisits,
  toSummaryEntry,
  toSummaryLast,
  verifyVisitMigration,
  type StoredVisit,
  type VisitSummary,
  type VisitSummaryEntry,
} from '../../src/lib/visitStore.js';

/**
 * Moving each customer's old visit array into its own subcollection.
 *
 * The instruction for this was "don't delete any service visits", so the order
 * of operations is the whole design, per customer:
 *
 *   1. ARCHIVE  the array exactly as it is, to customerVisitArchive. Archives
 *               are append-only: one that already exists is never overwritten,
 *               a second run writes a second archive.
 *   2. COPY     every visit not already stored into serviceVisits. A visit the
 *               sync already wrote is left alone — its copy is the newer one.
 *   3. VERIFY   by reading the subcollection back and checking every visit in
 *               the array is there.
 *   4. CLEAR    the old array — only if 3 passed, and only if the customer
 *               record has not changed since it was read. If anything else
 *               wrote to it in the meantime, this customer is skipped and
 *               picked up on the next run.
 *
 * A customer that fails any step keeps its array untouched. So at every point —
 * mid-run, after a crash, after a failed verify — each visit exists in at least
 * one place, and usually three.
 *
 * Dry run does steps 2 and 3 as arithmetic only and writes nothing.
 */

const DATA_ROOT = 'artifacts/hyundai-sales-to-service/public/data';
const ARCHIVE_COLLECTION = `${DATA_ROOT}/customerVisitArchive`;

export type CustomerMigrationStatus =
  | 'migrated'
  | 'would-migrate'
  | 'no-old-visits'
  | 'other-store'
  | 'verify-failed'
  | 'changed-during-run'
  | 'error';

export interface CustomerMigrationResult {
  customerId: string;
  status: CustomerMigrationStatus;
  /** Visits in the old array. */
  total: number;
  /** Visits copied into the subcollection this run. */
  copied: number;
  /** Visits that were already there, usually written by the sync. */
  alreadyStored: number;
  /** Visit ids not found after copying — present only when verify failed. */
  missing?: string[];
  error?: string;
}

export interface MigrationPage {
  dryRun: boolean;
  results: CustomerMigrationResult[];
  /** Customer id to continue after, or null when the whole collection is done. */
  nextCursor: string | null;
  /** Customers read this page, including ones with nothing to move. */
  scanned: number;
}

/** Stored ids only — select() with no fields reads names, not documents. */
async function storedVisitIds(db: Firestore, customerId: string): Promise<Set<string>> {
  const snap = await customersCollection(db)
    .doc(customerId)
    .collection(SERVICE_VISITS_COLLECTION)
    .select()
    .get();
  return new Set(snap.docs.map((d) => d.id));
}

/** Write a new archive; never overwrite one that is already there. */
async function archiveOldVisits(
  db: Firestore,
  customerId: string,
  dealershipId: string,
  visits: StoredVisit[],
  now: string
): Promise<string> {
  const payload = stripUndefinedDeep({
    customerId,
    dealershipId,
    visitCount: visits.length,
    visits,
    archivedAt: now,
    reason: 'Visits moved from the customer record to the serviceVisits subcollection.',
  });
  const primary = db.collection(ARCHIVE_COLLECTION).doc(customerId);
  try {
    await primary.create(payload);
    return primary.id;
  } catch (err) {
    // Already archived by an earlier run: keep that one, add another beside it.
    if ((err as { code?: number }).code !== 6) throw err; // 6 = ALREADY_EXISTS
    const extra = db.collection(ARCHIVE_COLLECTION).doc(`${customerId}__${now.replace(/[:.]/g, '-')}`);
    await extra.create(payload);
    return extra.id;
  }
}

/** Copy visits that are not stored yet. Uses create(), so it can never overwrite. */
async function copyVisits(
  db: Firestore,
  customerId: string,
  dealershipId: string,
  toCopy: Array<{ docId: string; visit: StoredVisit }>,
  now: string
): Promise<void> {
  const col = customersCollection(db).doc(customerId).collection(SERVICE_VISITS_COLLECTION);
  for (let i = 0; i < toCopy.length; i += 400) {
    const slice = toCopy.slice(i, i + 400);
    const batch = db.batch();
    for (const { docId, visit } of slice) {
      batch.create(
        col.doc(docId),
        stripUndefinedDeep({ ...visit, customerId, dealershipId, movedFromCustomerAt: now })
      );
    }
    try {
      await batch.commit();
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err;
      // Something wrote one of these between planning and copying — almost
      // certainly the sync, with a newer version. Copy the rest one at a time
      // and leave whatever is already there.
      for (const { docId, visit } of slice) {
        try {
          await col
            .doc(docId)
            .create(stripUndefinedDeep({ ...visit, customerId, dealershipId, movedFromCustomerAt: now }));
        } catch (inner) {
          if ((inner as { code?: number }).code !== 6) throw inner;
        }
      }
    }
  }
}

/**
 * The summary after the move. Starts from the one the sync already keeps, and
 * adds only visits it does not have — an older copy from the array never
 * replaces a newer synced entry.
 */
function summaryAfterMove(existing: VisitSummary | undefined, embedded: StoredVisit[], now: string): VisitSummary {
  if (!existing?.entries) return summarizeVisits(embedded, now);
  const entries = new Map<string, VisitSummaryEntry>(existing.entries.map((e) => [e.id, e]));
  let last = existing.last ?? null;
  for (const { docId, visit } of assignVisitDocIds(embedded)) {
    if (!entries.has(docId)) entries.set(docId, toSummaryEntry(docId, visit));
    last = newerLast(last, toSummaryLast(docId, visit));
  }
  return buildVisitSummary([...entries.values()], last, now);
}

function belongsTo(data: Record<string, unknown>, dealershipId: string): boolean {
  const own = String(data.dealershipId || '');
  // Older Hyundai records carry no dealershipId at all.
  return own ? own === dealershipId : dealershipId === 'hyundai';
}

async function migrateOne(
  db: Firestore,
  snap: DocumentSnapshot,
  dealershipId: string,
  dryRun: boolean,
  now: string
): Promise<CustomerMigrationResult> {
  const customerId = snap.id;
  const data = (snap.data() || {}) as Record<string, unknown>;
  const embedded = Array.isArray(data.recentVisits) ? (data.recentVisits as StoredVisit[]) : [];
  const base = { customerId, total: embedded.length, copied: 0, alreadyStored: 0 };

  if (!belongsTo(data, dealershipId)) return { ...base, status: 'other-store' };
  if (embedded.length === 0) return { ...base, status: 'no-old-visits' };

  try {
    const stored = await storedVisitIds(db, customerId);
    const plan = planVisitMigration(embedded, stored);

    if (dryRun) {
      return {
        ...base,
        status: 'would-migrate',
        copied: plan.toCopy.length,
        alreadyStored: plan.alreadyStored.length,
      };
    }

    const visitDealership = String(data.dealershipId || dealershipId);

    // 1. archive, before anything else changes
    await archiveOldVisits(db, customerId, visitDealership, embedded, now);
    // 2. copy
    await copyVisits(db, customerId, visitDealership, plan.toCopy, now);
    // 3. verify against what is actually stored now, not what we meant to write
    const after = await storedVisitIds(db, customerId);
    const check = verifyVisitMigration(plan.mustExist, after);
    if (!check.ok) {
      return {
        ...base,
        status: 'verify-failed',
        copied: plan.toCopy.length,
        alreadyStored: plan.alreadyStored.length,
        missing: check.missing.slice(0, 20),
      };
    }

    // 4. clear. One atomic update — summary in, array out — conditional on the
    // customer record being byte-for-byte the version read at the start. The
    // archive and the copies live elsewhere, so they do not move updateTime;
    // only someone else writing this customer does, and then nothing happens
    // here and the next run picks them up.
    const summary = summaryAfterMove(data.visitSummary as VisitSummary | undefined, embedded, now);
    const latestDate = summary.entries.find((e) => e.date)?.date;
    const patch = {
      ...(stripUndefinedDeep({
        visitSummary: summary,
        visitsMigratedAt: now,
        ...(latestDate ? { lastServiceDate: latestDate } : {}),
      }) as Record<string, unknown>),
      recentVisits: FieldValue.delete(),
    };
    try {
      await snap.ref.update(patch, { lastUpdateTime: snap.updateTime! });
    } catch (err) {
      if ((err as { code?: number }).code !== 9) throw err; // 9 = FAILED_PRECONDITION
      return {
        ...base,
        status: 'changed-during-run',
        copied: plan.toCopy.length,
        alreadyStored: plan.alreadyStored.length,
      };
    }

    return {
      ...base,
      status: 'migrated',
      copied: plan.toCopy.length,
      alreadyStored: plan.alreadyStored.length,
    };
  } catch (err) {
    return { ...base, status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** One customer, from a snapshot already read. Exported for the emulator tests. */
export { migrateOne as migrateCustomerFromSnapshot };

/**
 * One page of the migration. Pages by document id across the customers
 * collection, so it reaches every record — including older Hyundai ones that
 * carry no dealershipId and would be missed by a filtered query.
 */
export async function migrateCustomerVisitsPage(
  db: Firestore,
  options: { dealershipId: string; cursor?: string | null; limit?: number; dryRun?: boolean }
): Promise<MigrationPage> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 40));
  const dryRun = options.dryRun !== false;
  const now = new Date().toISOString();

  let query = customersCollection(db).orderBy(FieldPath.documentId()).limit(limit);
  if (options.cursor) query = query.startAfter(options.cursor);
  const page = await query.get();

  const results = await Promise.all(
    page.docs.map((snap) => migrateOne(db, snap, options.dealershipId, dryRun, now))
  );

  const lastDoc = page.docs[page.docs.length - 1];
  return {
    dryRun,
    results: results.filter((r) => r.status !== 'other-store' && r.status !== 'no-old-visits'),
    nextCursor: page.docs.length === limit && lastDoc ? lastDoc.id : null,
    scanned: page.docs.length,
  };
}
