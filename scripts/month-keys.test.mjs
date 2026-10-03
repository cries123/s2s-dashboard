/**
 * Tests for Operations month keys.
 *
 * These decide which document a month's figures are read from and written to,
 * and which date range PBS is asked for. An off-by-one here files a month's
 * numbers under the wrong month, which is exactly the mistake that would have
 * stored October's figures as September's.
 *
 * Run: npm run test:months
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-months-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['src/lib/operationsMonthKeys.ts'],
  bundle: true,
  format: 'esm',
  outfile: entry,
  logLevel: 'error',
});
const { isMonthKey, monthKeyOf, monthKeyRange, pastMonthKeys, monthKeyLabel } = await import(
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

// --- what counts as a month key -------------------------------------------
check('a normal key is one', isMonthKey('2026-09'), true);
check('December is one', isMonthKey('2026-12'), true);
check('January is one', isMonthKey('2026-01'), true);
check('month 13 is not', isMonthKey('2026-13'), false);
check('month 00 is not', isMonthKey('2026-00'), false);
check('an unpadded month is not', isMonthKey('2026-9'), false);
check('a full date is not', isMonthKey('2026-09-01'), false);
check("'active' is not", isMonthKey('active'), false);
check('a number is not', isMonthKey(202609), false);
check('null is not', isMonthKey(null), false);

// --- a date to its key -----------------------------------------------------
check('October pads to 10', monthKeyOf(new Date(2026, 9, 2)), '2026-10');
check('January pads to 01', monthKeyOf(new Date(2026, 0, 31)), '2026-01');
check('the last day of a month stays in that month', monthKeyOf(new Date(2026, 8, 30)), '2026-09');

// --- a key to its date range ----------------------------------------------
check('September has 30 days', monthKeyRange('2026-09'), { start: '2026-09-01', end: '2026-09-30' });
check('October has 31', monthKeyRange('2026-10'), { start: '2026-10-01', end: '2026-10-31' });
check('February in a common year has 28', monthKeyRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
check('February in a leap year has 29', monthKeyRange('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
check('December has 31', monthKeyRange('2026-12'), { start: '2026-12-01', end: '2026-12-31' });
{
  let threw = false;
  try { monthKeyRange('nonsense'); } catch { threw = true; }
  check('a bad key throws rather than inventing a range', threw, true);
}

// --- the past months, newest first ----------------------------------------
check(
  'from October, the three before it',
  pastMonthKeys(new Date(2026, 9, 2), 3),
  ['2026-09', '2026-08', '2026-07']
);
check(
  'the current month is never included',
  pastMonthKeys(new Date(2026, 9, 2), 12).includes('2026-10'),
  false
);
check(
  'January reaches back across the year boundary',
  pastMonthKeys(new Date(2026, 0, 15), 3),
  ['2025-12', '2025-11', '2025-10']
);
check('a full year is twelve months', pastMonthKeys(new Date(2026, 9, 2), 12).length, 12);
check('none of them repeat', new Set(pastMonthKeys(new Date(2026, 9, 2), 12)).size, 12);
check('asking for none gives none', pastMonthKeys(new Date(2026, 9, 2), 0), []);
// Run from the 31st: naive month arithmetic lands on March when you step back
// from March 31 to "February 31", which would skip February entirely.
check(
  'stepping back from the 31st does not skip a short month',
  pastMonthKeys(new Date(2026, 2, 31), 3),
  ['2026-02', '2026-01', '2025-12']
);

// --- labels ---------------------------------------------------------------
check('a key reads as a month and year', monthKeyLabel('2026-09'), 'September 2026');
check('a bad key is returned as-is rather than as Invalid Date', monthKeyLabel('nope'), 'nope');

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
