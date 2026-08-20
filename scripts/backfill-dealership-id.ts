/**
 * One-time backfill: set dealershipId: 'hyundai' on any document in the
 * tenant-scoped collections below that is missing the field entirely.
 *
 * WHY THIS EXISTS
 * ----------------
 * Before multi-tenant support, this app had one dealership (Hyundai) and
 * never wrote a dealershipId field. The updated firestore.rules in this
 * commit scopes `list`/collection queries with an explicit
 * where('dealershipId', '==', ...) filter to close a cross-dealership data
 * leak (see CODE_AUDIT.md, "Security — cross-dealership data exposure").
 *
 * Firestore can only allow a list query when it can prove every possible
 * result satisfies the security rule — it cannot do that for "field is
 * missing", only for an exact where() match. That means any pre-multi-tenant
 * document that never got a dealershipId will silently stop showing up in
 * list views (Customer Directory, Operations, Recall Outreach, etc.) once
 * the new rules are deployed, until this script has been run.
 *
 * This script is:
 *   - ADDITIVE ONLY — it only ever sets a missing dealershipId field. It
 *     never reads, changes, or deletes anything else in a document.
 *   - IDEMPOTENT — running it twice is safe; docs that already have the
 *     field are skipped entirely.
 *   - DRY-RUN BY DEFAULT — it only reports what it *would* change unless
 *     you pass --apply.
 *
 * USAGE
 *   npx tsx scripts/backfill-dealership-id.ts            # dry run, reports counts
 *   npx tsx scripts/backfill-dealership-id.ts --apply     # actually writes
 *
 * Run this once, with your own Firebase Admin credentials configured
 * (the same env vars server.ts uses), BEFORE or immediately after deploying
 * the updated firestore.rules — Claude has not run this against your
 * production database.
 */
import { getFirebaseAdminApp } from '../server/admin/initFirebaseAdmin.js';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTIONS = [
  'customers',
  'appointmentTracker',
  'appointmentSchedule',
  'recallCampaignLeads',
  'performance',
] as const;

const BASE_PATH = ['artifacts', 'hyundai-sales-to-service', 'public', 'data'] as const;
const BATCH_SIZE = 400; // Firestore batch limit is 500 writes; leave headroom.

async function main() {
  const apply = process.argv.includes('--apply');

  const app = getFirebaseAdminApp();
  if (!app) {
    console.error(
      'Firebase Admin could not initialize. Set the same service-account env vars server.ts uses ' +
        '(FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) and try again.'
    );
    process.exit(1);
  }

  const db = getFirestore(app);
  let totalMissing = 0;
  let totalWritten = 0;

  for (const collectionName of COLLECTIONS) {
    const colRef = db.collection([...BASE_PATH, collectionName].join('/'));
    const snap = await colRef.get();

    const missing = snap.docs.filter((d) => !('dealershipId' in d.data()));
    console.log(`\n${collectionName}: ${snap.size} total docs, ${missing.length} missing dealershipId`);
    totalMissing += missing.length;

    if (!apply || missing.length === 0) continue;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const chunk = missing.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const docSnap of chunk) {
        batch.update(docSnap.ref, { dealershipId: 'hyundai' });
      }
      await batch.commit();
      totalWritten += chunk.length;
      console.log(`  wrote ${totalWritten}/${missing.length}`);
    }
  }

  console.log(`\n${apply ? 'Applied' : 'Dry run — would apply'}: ${totalMissing} docs across ${COLLECTIONS.length} collections.`);
  if (!apply) {
    console.log('Re-run with --apply to actually write dealershipId: "hyundai" to these documents.');
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
