/**
 * When the scheduled PBS pull runs: 6:00 AM and 4:45 PM Pacific.
 *
 * Every 6 AM run since Sept 25 was cut off and never retried, and the 25-hour
 * catch-up that kept data arriving drifted later every day. These pin down the
 * rule that replaces both: due when nothing has finished since the latest
 * pull time — across midnight and across daylight saving.
 *
 * Run: npm run test:schedule
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-schedule-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['server/pbs/pbsSyncSchedule.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: entry,
  logLevel: 'error',
});
const S = await import(pathToFileURL(entry).href);

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

// October is daylight time: Pacific = UTC-7.
const pdt = (iso) => new Date(`${iso}-07:00`);
// December is standard time: Pacific = UTC-8.
const pst = (iso) => new Date(`${iso}-08:00`);

check('6:00 AM in October is 13:00 UTC', S.pacificWallToInstant(2026, 10, 16, 6, 0).toISOString(), '2026-10-16T13:00:00.000Z');
check('6:00 AM in December is 14:00 UTC', S.pacificWallToInstant(2026, 12, 16, 6, 0).toISOString(), '2026-12-16T14:00:00.000Z');
check('4:45 PM in October is 23:45 UTC', S.pacificWallToInstant(2026, 10, 16, 16, 45).toISOString(), '2026-10-16T23:45:00.000Z');

// --- which pull time is the latest -------------------------------------------------
check('5:59 AM: the latest was 4:45 PM yesterday', S.latestSyncSlot(pdt('2026-10-16T05:59')).toISOString(), pdt('2026-10-15T16:45').toISOString());
check('6:00 AM: it is 6:00 AM today', S.latestSyncSlot(pdt('2026-10-16T06:00')).toISOString(), pdt('2026-10-16T06:00').toISOString());
check('noon: still 6:00 AM today', S.latestSyncSlot(pdt('2026-10-16T12:00')).toISOString(), pdt('2026-10-16T06:00').toISOString());
check('4:45 PM: it is 4:45 PM today', S.latestSyncSlot(pdt('2026-10-16T16:45')).toISOString(), pdt('2026-10-16T16:45').toISOString());
check('11 PM: still 4:45 PM today', S.latestSyncSlot(pdt('2026-10-16T23:00')).toISOString(), pdt('2026-10-16T16:45').toISOString());
check('next after 7 AM is 4:45 PM', S.nextSyncSlot(pdt('2026-10-16T07:00')).toISOString(), pdt('2026-10-16T16:45').toISOString());
check('next after 5 PM is 6 AM tomorrow', S.nextSyncSlot(pdt('2026-10-16T17:00')).toISOString(), pdt('2026-10-17T06:00').toISOString());

// --- due or not ------------------------------------------------------------------
const lastNight = pdt('2026-10-15T16:50').toISOString();
check('5:55 AM, pulled at 4:50 PM yesterday: not due', S.isPbsSyncDue(lastNight, pdt('2026-10-16T05:55')), false);
check('6:00 AM, same: due', S.isPbsSyncDue(lastNight, pdt('2026-10-16T06:00')), true);
check('6:05 AM after a 6:00 run was cut off: still due, so it retries', S.isPbsSyncDue(lastNight, pdt('2026-10-16T06:05')), true);
check('6:10 AM after a pull finished at 6:03: not due', S.isPbsSyncDue(pdt('2026-10-16T06:03').toISOString(), pdt('2026-10-16T06:10')), false);
check('2 PM, morning pull done: not due', S.isPbsSyncDue(pdt('2026-10-16T06:03').toISOString(), pdt('2026-10-16T14:00')), false);
check('4:45 PM: due again', S.isPbsSyncDue(pdt('2026-10-16T06:03').toISOString(), pdt('2026-10-16T16:45')), true);
check('a manual pull at 5 PM counts for the afternoon', S.isPbsSyncDue(pdt('2026-10-16T17:00').toISOString(), pdt('2026-10-16T22:00')), false);
check('never pulled: due', S.isPbsSyncDue(undefined, pdt('2026-10-16T10:00')), true);
check('garbage date: due rather than stuck', S.isPbsSyncDue('not a date', pdt('2026-10-16T10:00')), true);

// --- daylight saving ends Nov 1 2026 at 2 AM ------------------------------------------
check('Nov 1, 5:59 AM PST: latest is Oct 31 4:45 PM PDT', S.latestSyncSlot(pst('2026-11-01T05:59')).toISOString(), pdt('2026-10-31T16:45').toISOString());
check('Nov 1, 6:00 AM PST is 14:00 UTC', S.latestSyncSlot(pst('2026-11-01T06:00')).toISOString(), '2026-11-01T14:00:00.000Z');
// --- and starts Mar 8 2026 ---------------------------------------------------------
check('Mar 8, 6:00 AM PDT is 13:00 UTC', S.latestSyncSlot(pdt('2026-03-08T06:00')).toISOString(), '2026-03-08T13:00:00.000Z');

// --- the other helpers -------------------------------------------------------------
check('within 15 minutes of 4:45 PM', S.isWithinSyncSlot(pdt('2026-10-16T16:55')), true);
check('not at 5:10 PM', S.isWithinSyncSlot(pdt('2026-10-16T17:10')), false);
check('backfill at 2:00 AM', S.isBackfillWindow(pdt('2026-10-16T02:00')), true);
check('backfill only once that hour', S.isBackfillWindow(pdt('2026-10-16T02:05')), false);
check('no backfill at 6 AM', S.isBackfillWindow(pdt('2026-10-16T06:00')), false);

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
