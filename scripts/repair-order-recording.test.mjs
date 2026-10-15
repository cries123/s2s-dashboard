/**
 * Which repair orders go into a car's file.
 *
 * Jaryn's rule: every repair order, open or paid. Before it, only paid ones
 * were ever recorded, so a car in the shop today had nothing in its file.
 *
 * Run: npm run test:recording
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// Inside the repo: this module reaches firebase-admin through pbsMappers.
const outDir = mkdtempSync(join('node_modules', '.s2s-recording-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['server/pbs/pbsIncrementalCriteria.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outfile: entry,
  logLevel: 'error',
});
const { isOpenRepairOrder, shouldRecordRepairOrder, shouldLogRepairOrderVisit } = await import(pathToFileURL(entry).href);

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

const open = { DateOpened: '2026-10-14T09:00:00.0000000-07:00', DateCashiered: '0001-01-01T00:00:00' };
const paid = { DateOpened: '2026-10-10T09:00:00.0000000-07:00', DateCashiered: '2026-10-12T15:00:00.0000000-07:00' };
const noCashierField = { DateOpened: '2026-10-14T09:00:00.0000000-07:00' };

check("PBS's empty 0001-01-01 cashier date means open", isOpenRepairOrder(open), true);
check('no cashier date at all means open', isOpenRepairOrder(noCashierField), true);
check('a cashier date means paid', isOpenRepairOrder(paid), false);

// --- the new rule records both ----------------------------------------------------------
check('an open repair order is recorded', shouldRecordRepairOrder(open, undefined), true);
check('a paid one is recorded', shouldRecordRepairOrder(paid, undefined), true);
check('an open one with no date at all is not — there is nothing to date it by', shouldRecordRepairOrder({}, undefined), false);

// --- on a daily pull, only what changed since the last run ------------------------------
const WATERMARK = '2026-10-13T00:00:00.000Z';
check('opened after the last run: recorded', shouldRecordRepairOrder(open, WATERMARK), true);
check('paid before the last run and untouched since: not re-recorded', shouldRecordRepairOrder(paid, WATERMARK), false);
check(
  'paid before, but modified since: recorded again so the file has the change',
  shouldRecordRepairOrder({ ...paid, LastUpdate: '2026-10-14T08:00:00.0000000-07:00' }, WATERMARK),
  true
);

// --- with matching off, nothing changes from before ------------------------------------
check('the old rule still skips open repair orders', shouldLogRepairOrderVisit(open, undefined), false);
check('and still takes paid ones', shouldLogRepairOrderVisit(paid, undefined), true);

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
