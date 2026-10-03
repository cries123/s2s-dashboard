/**
 * Tests for merging PBS service history into a customer record.
 *
 * This decides what happens to history already stored when a full refresh runs,
 * so it is the one place a sync can lose something. The rule being locked in:
 * PBS is the authority for the years it covers, and the hand-imported history
 * is the only record of the years before that, so it stays.
 *
 * Run: npm run test:visits
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// Inside the repo rather than the system temp directory: this module reaches
// firebase-admin through pbsFirestore, which is left external, so the bundle
// has to sit somewhere node can resolve node_modules from.
const outDir = mkdtempSync(join('node_modules', '.s2s-visits-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['server/pbs/pbsMappers.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outfile: entry,
  logLevel: 'error',
});
const { mergeVehiclePbsServiceVisits, mergeServiceVisits, isPbsImportedServiceVisit } = await import(
  pathToFileURL(entry).href
);

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

const VEH = 'veh-1';
const CUTOFF = '2023-10-03'; // three years before today, in the tests' terms

/** A row that came from the CSV import: no pbs- prefix. */
const imported = (soNumber, date) => ({ id: `csv-${soNumber}`, soNumber, date, requests: 'Imported' });
/** A row the sync wrote. */
const fromPbs = (soNumber, date, extra = {}) => ({
  id: `pbs-${soNumber}`,
  soNumber,
  date,
  pbsVehicleRef: VEH,
  ...extra,
});

// --- telling the two apart -------------------------------------------------
check('a synced row is recognised', isPbsImportedServiceVisit(fromPbs('1', '2026-01-01')), true);
check('an imported row is not', isPbsImportedServiceVisit(imported('1', '2019-01-01')), false);

// --- without a cutoff, nothing imported is touched -------------------------
// This is an incremental pull: PBS only returned what changed, so dropping
// imported rows would delete history nothing has replaced.
{
  const out = mergeVehiclePbsServiceVisits(
    [imported('A1', '2024-05-01'), imported('A2', '2019-05-01')],
    [fromPbs('B1', '2026-10-01')],
    VEH,
    300
  );
  check('an incremental pull keeps every imported row', out.length, 3);
  check(
    'including ones inside the PBS window',
    out.some((v) => v.soNumber === 'A1'),
    true
  );
}

// --- with a cutoff, PBS owns its window ------------------------------------
{
  const out = mergeVehiclePbsServiceVisits(
    [
      imported('OLD1', '2019-05-01'),
      imported('OLD2', '2021-12-31'),
      imported('RECENT', '2024-05-01'),
    ],
    [fromPbs('NEW', '2026-10-01')],
    VEH,
    300,
    CUTOFF
  );
  const sos = out.map((v) => v.soNumber).sort();
  check('imported rows older than the cutoff are kept', sos.includes('OLD1') && sos.includes('OLD2'), true);
  check('an imported row inside the PBS window is dropped', sos.includes('RECENT'), false);
  check('the real repair order is there', sos.includes('NEW'), true);
  check('nothing else appears from nowhere', out.length, 3);
}

{
  // The boundary itself belongs to PBS.
  const out = mergeVehiclePbsServiceVisits(
    [imported('ON', CUTOFF), imported('BEFORE', '2023-10-02')],
    [fromPbs('NEW', '2026-10-01')],
    VEH,
    300,
    CUTOFF
  );
  const sos = out.map((v) => v.soNumber);
  check('a row on the cutoff date is superseded', sos.includes('ON'), false);
  check('the day before it is kept', sos.includes('BEFORE'), true);
}

{
  // An imported row with no date cannot be shown to be superseded, so it stays.
  const out = mergeVehiclePbsServiceVisits(
    [{ id: 'csv-X', soNumber: 'X', date: '' }],
    [fromPbs('NEW', '2026-10-01')],
    VEH,
    300,
    CUTOFF
  );
  check('an undated imported row is kept rather than guessed at', out.some((v) => v.soNumber === 'X'), true);
}

// --- PBS rows for other vehicles ------------------------------------------
{
  const out = mergeVehiclePbsServiceVisits(
    [fromPbs('OTHER', '2025-01-01', { pbsVehicleRef: 'veh-2' }), fromPbs('MINE', '2025-02-01')],
    [fromPbs('NEW', '2026-10-01')],
    VEH,
    300,
    CUTOFF
  );
  const sos = out.map((v) => v.soNumber).sort();
  check("another vehicle's synced rows are not carried over", sos.includes('OTHER'), false);
  check("this vehicle's are", sos.includes('MINE'), true);
}

// --- re-pulling the same repair order -------------------------------------
{
  const out = mergeServiceVisits(
    [{ id: 'pbs-7', soNumber: '7', date: '2026-09-03', mileage: 1 }],
    [{ id: 'pbs-7', soNumber: '7', date: '2026-09-03', openedDate: '2026-09-01', mileage: 2, lines: [{ lineNumber: 1 }] }],
    300
  );
  check('a re-pulled repair order updates in place, not twice', out.length, 1);
  check('and gains the fields the new pull carries', out[0].openedDate, '2026-09-01');
  check('and the newer values win', out[0].mileage, 2);
}

// --- the cap ---------------------------------------------------------------
{
  // 120 synced visits plus old imported history, under the old cap of 100 the
  // imported years fell off the end. This is why the cap was raised.
  const existing = [
    imported('OLD', '2019-01-01'),
    ...Array.from({ length: 120 }, (_, i) => fromPbs(`S${i}`, `2025-${String((i % 12) + 1).padStart(2, '0')}-01`)),
  ];
  const tight = mergeVehiclePbsServiceVisits(existing, [fromPbs('NEW', '2026-10-01')], VEH, 100);
  check('at the old cap the imported history is lost', tight.some((v) => v.soNumber === 'OLD'), false);
  const roomy = mergeVehiclePbsServiceVisits(existing, [fromPbs('NEW', '2026-10-01')], VEH, 300);
  check('with room, it survives', roomy.some((v) => v.soNumber === 'OLD'), true);
  check('and the list is capped at the limit', tight.length, 100);
}

// --- newest first ----------------------------------------------------------
{
  const out = mergeVehiclePbsServiceVisits(
    [imported('OLD', '2019-01-01')],
    [fromPbs('A', '2026-01-01'), fromPbs('B', '2026-06-01')],
    VEH,
    300,
    CUTOFF
  );
  check('visits come back newest first', out.map((v) => v.date), ['2026-06-01', '2026-01-01', '2019-01-01']);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
