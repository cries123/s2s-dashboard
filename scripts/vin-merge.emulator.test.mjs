/**
 * Merging one car's two profiles, run for real against the Firestore emulator.
 *
 * vin-merge.test.mjs proves the rules. This proves the writes: every visit on
 * the merged profile ends up on the kept one, a backup is made first, a second
 * run changes nothing, and a car that fails part-way is left exactly as it was.
 * "Don't delete any service visits" still holds: the headline check is that the
 * kept profile stores every visit both profiles had.
 *
 * Run: npm run test:vinmerge:emulator  (starts the emulator itself)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is not set — run through `npm run test:vinmerge:emulator`.');
  process.exit(1);
}

const outDir = mkdtempSync(join('node_modules', '.s2s-vinmerge-emu-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({ entryPoints: ['server/pbs/vinDuplicateMerge.ts'], bundle: true, format: 'esm', platform: 'node', packages: 'external', outfile: entry, logLevel: 'error' });
const { findCarsOnSeveralProfiles, previewCarMerge, mergeCar } = await import(pathToFileURL(entry).href);

initializeApp({ projectId: 'demo-s2s' });
const db = getFirestore();

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); failed++; } else passed++;
}

const ROOT = 'artifacts/hyundai-sales-to-service/public/data';
const customers = db.collection(`${ROOT}/customers`);
const backups = db.collection(`${ROOT}/customerMergeBackups`);
const sub = (id, name) => customers.doc(id).collection(name);
const ids = async (q) => (await q.get()).docs.map((d) => d.id).sort();

async function wipe() {
  for (const snap of (await customers.get()).docs) {
    for (const name of ['serviceVisits', 'contactLog']) for (const d of (await snap.ref.collection(name).get()).docs) await d.ref.delete();
    await snap.ref.delete();
  }
  for (const b of (await backups.get()).docs) await b.ref.delete();
}

async function seed() {
  await customers.doc('PBS1').set({
    firstName: '', lastName: 'Customer', phone: '', dealershipId: 'hyundai', addedBy: 'pbs-sync',
    vin: '1FMSK8DH2MGB18836', vinLast8: 'MGB18836', year: '2021', model: 'EXPLORER',
    pbsVehicleId: 'veh-1', pbsVehicleRefs: ['veh-1'], lastServiceDate: '2026-03-03',
    visitSummary: { version: 1, updatedAt: 'x', last: null, entries: [
      { id: 'pbs-116128', date: '2026-03-03', so: '116128' }, { id: 'pbs-114002', date: '2025-09-23', so: '114002' },
    ] },
  });
  await sub('PBS1', 'serviceVisits').doc('pbs-116128').set({ id: 'pbs-116128', soNumber: '116128', date: '2026-03-03', customerId: 'PBS1', dealershipId: 'hyundai' });
  await sub('PBS1', 'serviceVisits').doc('pbs-114002').set({ id: 'pbs-114002', soNumber: '114002', date: '2025-09-23', customerId: 'PBS1', dealershipId: 'hyundai' });
  await customers.doc('IMP1').set({
    firstName: 'JANET', lastName: 'GUERRA', phone: '8055550101', dealershipId: 'hyundai', addedBy: 'admin',
    vinLast8: 'MGB18836', year: '2021', model: 'EXPLORER', lastServiceDate: '03/02/2026 9:10:00 AM',
    recentVisits: [
      { id: '8jd7v6u', date: '03/10/2023 2:56:35 PM', soNumber: '102043', requests: 'LOF' },
      { id: 'k2m9p1q', date: '03/02/2026 9:10:00 AM', soNumber: '116128', requests: 'LOF' },
    ],
  });
  // A visit the import stores as a document, and one the PBS profile has too.
  await sub('IMP1', 'serviceVisits').doc('pbs-100500').set({ id: 'pbs-100500', soNumber: '100500', date: '2024-02-02', customerId: 'IMP1', dealershipId: 'hyundai' });
  await sub('IMP1', 'serviceVisits').doc('pbs-114002').set({ id: 'pbs-114002', soNumber: '114002', date: '2025-09-23', customerId: 'IMP1', dealershipId: 'hyundai' });
  await sub('IMP1', 'contactLog').doc('c1').set({ outcome: 'left_voicemail', at: '2026-04-01' });
  await sub('IMP1', 'contactLog').doc('c2').set({ outcome: 'booked', at: '2026-04-05' });
  // A different car in another store with the same tail: never grouped with these.
  await customers.doc('FORD1').set({ dealershipId: 'ford', vinLast8: 'MGB18836', year: '2021', model: 'EXPLORER' });
}

const NOW = '2026-10-16T21:00:00.000Z';
await wipe();
await seed();

// --- find and preview: reads only ---------------------------------------------------------------
const found = await findCarsOnSeveralProfiles(db, 'hyundai');
check('one car on two Hyundai profiles (the Ford store is separate)', found.groups, [{ tail: 'MGB18836', ids: ['IMP1', 'PBS1'] }]);
const preview = await previewCarMerge(db, found.groups[0], NOW);
check('preview: planned, PBS profile kept, Janet the owner', [preview.status, preview.plan.keepId, preview.plan.ownerName], ['planned', 'PBS1', 'JANET GUERRA']);
check('preview wrote nothing', [await ids(sub('PBS1', 'serviceVisits')), (await customers.doc('IMP1').get()).get('mergedInto')], [['pbs-114002', 'pbs-116128'], undefined]);

// --- a failure part-way leaves the car untouched ----------------------------------------------
await backups.doc('PBS1__run-clash').set({ already: 'here' });
const clash = await mergeCar(db, found.groups[0], { dealershipId: 'hyundai', now: NOW, runId: 'run-clash' });
check('a write that fails (backup id taken) fails the whole car', clash.status, 'failed');
check('...and nothing changed: no visit copied, import not merged', [await ids(sub('PBS1', 'serviceVisits')), (await customers.doc('IMP1').get()).get('recentVisits').length, (await customers.doc('IMP1').get()).get('mergedInto')], [['pbs-114002', 'pbs-116128'], 2, undefined]);
await backups.doc('PBS1__run-clash').delete();

// --- the merge ----------------------------------------------------------------------------------
const before = 2 + 2 + 2; // PBS docs + import array + import docs
const result = await mergeCar(db, found.groups[0], { dealershipId: 'hyundai', now: NOW, runId: 'run-1' });
check('merged and read back', [result.status, result.verified], ['merged', true]);
const kept = await ids(sub('PBS1', 'serviceVisits'));
check('kept profile stores every visit: its 2, the import\'s 2 array visits and its new doc', kept, ['8jd7v6u', 'k2m9p1q', 'pbs-100500', 'pbs-114002', 'pbs-116128']);
check('the same PBS repair order (114002) is stored once on the kept profile', kept.filter((i) => i.startsWith('pbs-114002')).length, 1);
const keptDoc = (await customers.doc('PBS1').get()).data();
check('kept profile: Janet, her phone, both PBS ids', [keptDoc.firstName, keptDoc.lastName, keptDoc.phone, keptDoc.pbsVehicleRefs], ['JANET', 'GUERRA', '8055550101', ['veh-1']]);
check('kept summary: RO 116128 counted once, 2024 and 2023 visits added', keptDoc.visitSummary.entries.map((e) => e.id), ['pbs-116128', 'pbs-114002', 'pbs-100500', '8jd7v6u']);
check('copied visit says where it came from', (await sub('PBS1', 'serviceVisits').doc('8jd7v6u').get()).get('movedFromCustomerId'), 'IMP1');
check('her call notes moved', await ids(sub('PBS1', 'contactLog')), ['c1', 'c2']);
const imp = (await customers.doc('IMP1').get()).data();
check('import: hidden, pointing at the kept profile, name kept for the record', [imp.mergedInto, imp.firstName, imp.mergedVin], ['PBS1', 'JANET', '1FMSK8DH2MGB18836']);
check('import: car and history cleared', ['vinLast8', 'recentVisits', 'visitSummary'].map((f) => f in imp), [false, false, false]);
check("import's own visit documents are kept, marked as merged", (await sub('IMP1', 'serviceVisits').get()).docs.map((d) => [d.id, d.get('mergedInto'), d.get('copiedTo')]), [['pbs-100500', 'PBS1', 'pbs-100500'], ['pbs-114002', 'PBS1', 'pbs-114002']]);
check('backups: both profiles, the import with its visits and notes', (await backups.get()).docs.map((d) => [d.id, d.get('role'), (d.get('serviceVisits') ?? []).length, (d.get('contactLog') ?? []).length]).sort(), [['IMP1__run-1', 'merged', 2, 2], ['PBS1__run-1', 'kept', 0, 0]]);
check('backup holds the import exactly as it was', (await backups.doc('IMP1__run-1').get()).get('record.recentVisits').length, 2);
check(`no visit lost: ${before} stored or embedded before, ${kept.length} distinct on the kept profile + 1 shared RO`, kept.length + 1 >= before - 0, true);

// --- run again -------------------------------------------------------------------------------------
check('nothing left to merge', (await findCarsOnSeveralProfiles(db, 'hyundai')).groups, []);
const again = await mergeCar(db, { tail: 'MGB18836', ids: ['IMP1', 'PBS1'] }, { dealershipId: 'hyundai', now: NOW, runId: 'run-2' });
check('a second run on the same car does nothing', [again.status, again.reason], ['skipped', 'Already merged']);
check('...and writes no backup', (await backups.get()).size, 2);

await wipe();
rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
