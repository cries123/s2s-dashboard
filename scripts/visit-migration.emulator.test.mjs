/**
 * The visit migration, run for real against the Firestore emulator.
 *
 * The unit tests prove the planning arithmetic. This proves the actual writes:
 * seed customers with visits embedded the old way, run the migration exactly as
 * the server does, then count. The instruction was "don't delete any service
 * visits", so the headline check is that the number of visits stored after is
 * at least the number embedded before, customer by customer and in total.
 *
 * Run: npm run test:migration  (starts the emulator itself)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is not set — run through `npm run test:migration`.');
  process.exit(1);
}

const outDir = mkdtempSync(join('node_modules', '.s2s-migration-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['server/pbs/pbsVisitMigration.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outfile: entry,
  logLevel: 'error',
});
const { migrateCustomerVisitsPage, migrateCustomerFromSnapshot } = await import(pathToFileURL(entry).href);

initializeApp({ projectId: 'demo-s2s' });
const db = getFirestore();

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  } else passed++;
}

const ROOT = 'artifacts/hyundai-sales-to-service/public/data';
const customers = db.collection(`${ROOT}/customers`);
const archive = db.collection(`${ROOT}/customerVisitArchive`);
const visitsOf = (id) => customers.doc(id).collection('serviceVisits');
const pbs = (so, date, extra = {}) => ({ id: `pbs-${so}`, soNumber: so, date, mileage: 1000, advisor: 'FRANK', requests: 'Service', ...extra });

async function wipe() {
  for (const snap of (await customers.get()).docs) {
    for (const v of (await snap.ref.collection('serviceVisits').get()).docs) await v.ref.delete();
    await snap.ref.delete();
  }
  for (const a of (await archive.get()).docs) await a.ref.delete();
}

async function runAll(dryRun) {
  const all = [];
  let cursor = null;
  do {
    const page = await migrateCustomerVisitsPage(db, { dealershipId: 'hyundai', cursor, limit: 3, dryRun });
    all.push(...page.results);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

async function seed() {
  await wipe();
  // A: the plain case.
  await customers.doc('A').set({
    firstName: 'Ana', dealershipId: 'hyundai',
    recentVisits: [pbs('1', '2026-01-01'), pbs('2', '2026-03-01', { requests: 'LOF' }), { id: 'csv-1', soNumber: '', date: '2019-05-05', requests: 'Imported' }],
  });
  // B: the sync already stored a NEWER copy of pbs-5. It must not be overwritten.
  await customers.doc('B').set({
    firstName: 'Ben', dealershipId: 'hyundai',
    recentVisits: [pbs('5', '2026-02-02', { mileage: 1 }), { id: 'csv-9', date: '2018-01-01' }],
  });
  await visitsOf('B').doc('pbs-5').set({ ...pbs('5', '2026-02-02', { mileage: 99999 }), dealershipId: 'hyundai', customerId: 'B', newerFromSync: true });
  // C: three different visits that would all land on one document id.
  await customers.doc('C').set({
    firstName: 'Cal', dealershipId: 'hyundai',
    recentVisits: [{ id: 'dup', date: '2019-01-01' }, { id: 'dup', date: '2019-06-01' }, { id: 'dup', date: '2020-01-01' }],
  });
  // D: no history at all — nothing to do.
  await customers.doc('D').set({ firstName: 'Dee', dealershipId: 'hyundai' });
  // E: another store. Out of scope; must be left alone.
  await customers.doc('E').set({ firstName: 'Eve', dealershipId: 'nissan', recentVisits: [pbs('7', '2026-01-01')] });
  // F: an older Hyundai record with no dealershipId at all.
  await customers.doc('F').set({ firstName: 'Fay', recentVisits: [pbs('8', '2025-08-08')] });
  // G: a big one — 300 visits, the old cap.
  await customers.doc('G').set({
    firstName: 'Gus', dealershipId: 'hyundai',
    recentVisits: Array.from({ length: 300 }, (_, i) => pbs(`g${i}`, `2024-${String((i % 12) + 1).padStart(2, '0')}-01`)),
  });
}

const EMBEDDED_BEFORE = { A: 3, B: 2, C: 3, F: 1, G: 300 };

// --- dry run writes nothing ------------------------------------------------------
await seed();
{
  const rows = await runAll(true);
  check('dry run: reports every customer with history in this store', rows.map((r) => r.customerId).sort(), ['A', 'B', 'C', 'F', 'G']);
  check('dry run: counts what would copy, skipping what the sync stored', rows.find((r) => r.customerId === 'B').copied, 1);
  check('dry run: no visits written', (await visitsOf('A').get()).size, 0);
  check('dry run: no archive written', (await archive.get()).size, 0);
  check('dry run: the old list is still there', (await customers.doc('A').get()).data().recentVisits.length, 3);
}

// --- the real run -----------------------------------------------------------------
await seed();
const rows = await runAll(false);
check('every in-scope customer migrated', rows.filter((r) => r.status === 'migrated').map((r) => r.customerId).sort(), ['A', 'B', 'C', 'F', 'G']);
check('nobody held back', rows.filter((r) => r.status !== 'migrated'), []);

// The headline: nothing lost.
let before = 0;
let after = 0;
for (const [id, n] of Object.entries(EMBEDDED_BEFORE)) {
  const stored = (await visitsOf(id).get()).size;
  before += n;
  after += stored;
  check(`customer ${id}: every visit stored (${n} in, ${stored} out)`, stored >= n, true);
}
check(`in total: ${before} visits embedded, ${after} stored — none lost`, after >= before, true);

{
  const a = (await customers.doc('A').get()).data();
  check('A: the old list is cleared', 'recentVisits' in a, false);
  check('A: the summary covers every visit', a.visitSummary.entries.length, 3);
  check('A: newest first', a.visitSummary.entries.map((e) => e.date), ['2026-03-01', '2026-01-01', '2019-05-05']);
  check('A: the oil change is recognised', a.visitSummary.entries.find((e) => e.id === 'pbs-2').oil, true);
  check('A: marked as moved', typeof a.visitsMigratedAt, 'string');
  check('A: last service date set from the history', a.lastServiceDate, '2026-03-01');
  check('A: other fields untouched', a.firstName, 'Ana');
  const ids = (await visitsOf('A').get()).docs.map((d) => d.id).sort();
  check('A: stored under the ids the sync uses', ids, ['csv-1', 'pbs-1', 'pbs-2']);
  const v = (await visitsOf('A').doc('pbs-1').get()).data();
  check('A: a copied visit keeps its fields', [v.soNumber, v.date, v.advisor, v.mileage], ['1', '2026-01-01', 'FRANK', 1000]);
  check('A: and carries its store, for the security rules', v.dealershipId, 'hyundai');
}
{
  const b5 = (await visitsOf('B').doc('pbs-5').get()).data();
  check('B: the newer copy the sync wrote is not overwritten', b5.newerFromSync, true);
  check('B: its newer mileage survives', b5.mileage, 99999);
  check('B: the visit only the old list had was copied', (await visitsOf('B').doc('csv-9').get()).exists, true);
}
{
  const ids = (await visitsOf('C').get()).docs.map((d) => d.id).sort();
  check('C: three visits sharing an id become three documents, not one', ids, ['dup', 'dup-2', 'dup-3']);
  check('C: each kept its own date', (await visitsOf('C').get()).docs.map((d) => d.data().date).sort(), ['2019-01-01', '2019-06-01', '2020-01-01']);
}
{
  const d = (await customers.doc('D').get()).data();
  check('D: a customer with no history is not touched', 'visitsMigratedAt' in d, false);
  const e = (await customers.doc('E').get()).data();
  check('E: another store is left exactly as it was', e.recentVisits.length, 1);
  check('E: nothing written for it', (await visitsOf('E').get()).size, 0);
  const f = (await customers.doc('F').get()).data();
  check('F: an old Hyundai record with no dealershipId is still migrated', 'recentVisits' in f, false);
  check('F: and its visits are tagged hyundai', (await visitsOf('F').doc('pbs-8').get()).data().dealershipId, 'hyundai');
}
{
  const g = (await customers.doc('G').get()).data();
  check('G: all 300 visits stored', (await visitsOf('G').get()).size, 300);
  check('G: summary holds all 300', g.visitSummary.entries.length, 300);
}

// --- the archive -------------------------------------------------------------------
{
  const a = (await archive.doc('A').get()).data();
  check('archive: written for every moved customer', (await archive.get()).size, 5);
  check('archive: holds the original list exactly', a.visits.length, 3);
  check('archive: byte for byte', a.visits.map((v) => v.id), ['pbs-1', 'pbs-2', 'csv-1']);
}

// --- running it again ---------------------------------------------------------------
{
  const again = await runAll(false);
  check('a second run finds nothing left to move', again.length, 0);
  check('and writes no extra copies', (await visitsOf('A').get()).size, 3);
}

// --- the record changes during the run ---------------------------------------------
await wipe();
{
  await customers.doc('H').set({ firstName: 'Hal', dealershipId: 'hyundai', recentVisits: [pbs('20', '2026-01-01'), pbs('21', '2026-02-01')] });
  const snap = await customers.doc('H').get();
  // Something else writes the customer after it was read — the sync, a user.
  await customers.doc('H').update({ phone: '805-555-0199' });
  const result = await migrateCustomerFromSnapshot(db, snap, 'hyundai', false, new Date().toISOString());
  check('a record that changed mid-run is held back', result.status, 'changed-during-run');
  const h = (await customers.doc('H').get()).data();
  check('and its old list is untouched', h.recentVisits.length, 2);
  check('the change that was made is kept', h.phone, '805-555-0199');
  check('the visits were still copied, so they are in two places now', (await visitsOf('H').get()).size, 2);
  check('the archive was still written, so three', (await archive.doc('H').get()).exists, true);

  // The next run picks it up cleanly.
  const retry = await runAll(false);
  check('the next run moves it', retry.map((r) => [r.customerId, r.status]), [['H', 'migrated']]);
  check('without copying anything twice', (await visitsOf('H').get()).size, 2);
  check('and the first archive is never overwritten — a second sits beside it', (await archive.get()).size, 2);
  check('the change made mid-run is still there', (await customers.doc('H').get()).data().phone, '805-555-0199');
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
