/**
 * Tests for the PartnerHUB capability probe.
 *
 * The probe calls a third-party API with the dealership's live credentials, so
 * the thing worth locking down is not its output but its blast radius: it must
 * never call anything that changes data. PartnerHUB's write operations all end
 * in "Change", and the probe list is hard-coded so a future catalogue entry
 * cannot quietly add one.
 *
 * Run: npm run test:pbscaps
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join('node_modules', '.s2s-pbscaps-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['server/pbs/pbsCapabilityProbe.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outfile: entry,
  logLevel: 'error',
});
const { PBS_READ_OPERATIONS, PBS_OPERATIONS_IN_USE, probePbsCapabilities } = await import(
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

// --- blast radius ----------------------------------------------------------
check(
  'every operation probed is a read',
  PBS_READ_OPERATIONS.filter((op) => !op.endsWith('Get')),
  []
);
// Suffix, not substring: DealFeeSetupsGet contains "Set" and is a read. The
// first version of this check flagged eleven perfectly safe operations, which
// is its own kind of failure — a guard that cries wolf gets switched off.
check(
  'nothing that changes data is in the list',
  PBS_READ_OPERATIONS.filter((op) => /(Change|Set|Delete|Create|Update)$/.test(op)),
  []
);
check(
  'and none of the action endpoints',
  PBS_READ_OPERATIONS.filter((op) => ['Auth', 'AssignRoles', 'UnAssignRoles'].includes(op)),
  []
);
check('the list has no duplicates', new Set(PBS_READ_OPERATIONS).size, PBS_READ_OPERATIONS.length);
check('the catalogue is the 53 read operations', PBS_READ_OPERATIONS.length, 53);

// --- the in-use set has to be real ----------------------------------------
check(
  'every operation we claim to use is one PBS publishes',
  [...PBS_OPERATIONS_IN_USE].filter((op) => !PBS_READ_OPERATIONS.includes(op)),
  []
);
check('we currently use eleven of them', PBS_OPERATIONS_IN_USE.size, 11);
check(
  'the two PBS already refuses are in the list, so the probe confirms them',
  ['PartsInvoiceGet', 'TimeClockActivityGet'].every((op) => PBS_READ_OPERATIONS.includes(op)),
  true
);

// --- paging ----------------------------------------------------------------
// Without credentials configured every probe short-circuits, so this exercises
// the slicing without making a single network call.
{
  const first = await probePbsCapabilities(0, 5);
  check('a slice returns what was asked for', first.results.length, 5);
  check('it reports the total', first.total, 53);
  check('and where to continue from', first.nextOffset, 5);
  check('no credentials means nothing is reported as granted', first.results.every((r) => !r.granted), true);
  check('and each row says why', first.results.every((r) => typeof r.note === 'string'), true);

  const last = await probePbsCapabilities(50, 8);
  check('the final slice stops at the end', last.results.length, 3);
  check('and reports no continuation', last.nextOffset, null);

  const overshoot = await probePbsCapabilities(500, 8);
  check('an offset past the end returns nothing rather than throwing', overshoot.results.length, 0);

  const huge = await probePbsCapabilities(0, 999);
  check('the batch size is capped so one request cannot probe everything', huge.results.length <= 12, true);

  const seen = new Set();
  let cursor = 0;
  let guard = 0;
  while (cursor !== null && guard++ < 40) {
    const page = await probePbsCapabilities(cursor, 12);
    page.results.forEach((r) => seen.add(r.operation));
    cursor = page.nextOffset;
  }
  check('paging all the way through covers every operation exactly once', seen.size, 53);
}

// --- what the report says about usage -------------------------------------
{
  const page = await probePbsCapabilities(0, 12);
  const row = page.results.find((r) => r.operation === 'ContactGet');
  check('an operation we already call is marked as in use', row.inUse, true);
  const unused = page.results.find((r) => r.operation === 'AccountGet');
  check('one we have never called is not', unused.inUse, false);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
