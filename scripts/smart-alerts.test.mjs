/**
 * Tests for the smart service-alert window.
 *
 * Run: npm run test:alerts
 *
 * "Today" is fixed at 2026-09-03 so results never drift with the real clock.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// Compile the TS module to plain JS so this runs under bare node. Uses esbuild's
// Node API rather than its CLI — spawning .cmd shims fails on Windows.
const outDir = mkdtempSync(join(tmpdir(), 's2s-alerts-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['src/lib/serviceAlertWindow.ts'],
  bundle: true,
  format: 'esm',
  outfile: entry,
  logLevel: 'error',
});
const { evaluateSmartAlert, DEFAULT_SMART_ALERT_CONFIG } = await import(pathToFileURL(entry).href);

const TODAY = new Date('2026-09-03T00:00:00');
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    console.log(`        expected ${expected}, got ${actual}`);
    failed++;
  }
}

/** Build a customer with oil-change visits N days before "today". */
function customer(daysAgoList, overrides = {}) {
  return {
    id: 'c1',
    enableServiceAlert: true,
    recentVisits: daysAgoList.map((daysAgo, i) => {
      const d = new Date(TODAY.getTime() - daysAgo * 86400000);
      return {
        id: `v${i}`,
        soNumber: `SO${i}`,
        date: d.toISOString().slice(0, 10),
        mileage: 10000 + i * 4000,
        advisor: 'Test',
        requests: 'Lube Oil Filter',
      };
    }),
    ...overrides,
  };
}

const run = (c, cfg = DEFAULT_SMART_ALERT_CONFIG) => evaluateSmartAlert(c, cfg, TODAY);

console.log('\nThe case you described: 3.8-month cadence, last visit 3.7 months ago');
// Visits 116 and 232 days ago => cadence 116 days (3.8 months). Last visit 116
// days ago (3.8 mo)... due right about now.
check('surfaces as due',
  ['due-soon', 'due-now', 'overdue'].includes(run(customer([116, 232])).status) , true);

console.log('\nActive-customer gate');
check('last visit 3 years ago is NOT alerted',
  run(customer([1095, 1200])).status, 'inactive');
check('last visit 3 years ago -> shouldAlert false',
  run(customer([1095, 1200])).shouldAlert, false);
check('last visit 13 months ago is NOT alerted',
  run(customer([400, 520])).status, 'inactive');
check('last visit 11 months ago is active, but missed its window',
  run(customer([330, 450])).status, 'missed');
check('3 years ago is inactive, not merely missed',
  run(customer([1095, 1200])).status, 'inactive');

console.log('\nLead time — the point is to call BEFORE they are due');
// cadence 120 days, last visit 110 days ago => due in 10 days => inside 21-day lead
check('due in 10 days shows as due-soon',
  run(customer([110, 230])).status, 'due-soon');
check('due in 10 days is alerted',
  run(customer([110, 230])).shouldAlert, true);
// cadence 120, last visit 30 days ago => due in 90 days => outside lead time
check('due in 90 days is not yet alerted',
  run(customer([30, 150])).status, 'not-due');

console.log('\nStale gate — they were due and never came in');
// cadence 120 days, last visit 200 days ago => 80 days past due => beyond 60
check('80 days past due drops off the list',
  run(customer([200, 320])).status, 'missed');
// cadence 120, last visit 150 days ago => 30 days past due => still in window
check('30 days past due is still alerted',
  run(customer([150, 270])).status, 'overdue');

console.log('\nHistory requirements');
check('no visits at all -> insufficient-history',
  run({ id: 'x', enableServiceAlert: true, recentVisits: [] }).status, 'insufficient-history');
check('single visit with no interval -> insufficient-history',
  run(customer([100])).status, 'insufficient-history');
check('single visit WITH per-customer interval is usable',
  run(customer([100], { serviceAlertIntervalDays: 110 })).status, 'due-soon');

console.log('\nSuppression');
check('alerts disabled -> suppressed',
  run(customer([116, 232], { enableServiceAlert: false })).status, 'suppressed');
check('stop-alert flag -> suppressed',
  run(customer([116, 232], { stopAlertInfo: { reason: 'moved' } })).status, 'suppressed');

console.log('\nStructured PBS lines are recognised as oil changes');
const pbsCustomer = {
  id: 'pbs', enableServiceAlert: true,
  recentVisits: [116, 232].map((daysAgo, i) => ({
    id: `p${i}`, soNumber: `RO${i}`,
    date: new Date(TODAY.getTime() - daysAgo * 86400000).toISOString().slice(0, 10),
    mileage: 20000 + i * 5000, advisor: 'A',
    requests: 'Customer Request',            // generic summary, like a CSV import
    lines: [{ lineNumber: 1, correction: 'Performed synthetic oil and filter change' }],
  })),
};
check('detects oil change from job lines, not just the summary',
  run(pbsCustomer).shouldAlert, true);

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
