/**
 * Tests for sales-to-service conversion and appointment show rate.
 * Run: npm run test:conversion
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-conv-'));
const build = async (src, name) => {
  const out = join(outDir, `${name}.mjs`);
  await esbuild.build({ entryPoints: [src], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
};
const { computeSalesToService } = await build('src/lib/salesToService.ts', 'sts');
const { computeShowRate, nameKey } = await build('src/lib/appointmentShowRate.ts', 'show');

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

const visit = (date, labour = [], parts = []) => ({
  date,
  lines: [{ labourLines: labour.map((price) => ({ price })), partLines: parts.map((price) => ({ price })) }],
});

console.log('\nSales to service');

// A visit before the sale belongs to someone else's ownership of that car.
{
  const r = computeSalesToService([
    { id: 'a', firstName: 'A', lastName: 'One', soldDate: '2026-01-10', recentVisits: [visit('2025-11-02')] },
  ]);
  check('a visit before the sold date does not count', r.converted, 0);
  check('that customer still counts as sold', r.sold, 1);
}

// The basic happy path.
{
  const r = computeSalesToService([
    { id: 'a', soldDate: '2026-01-10', addedByUsername: 'Dana', recentVisits: [visit('2026-04-01', [120], [40])] },
    { id: 'b', soldDate: '2026-01-20', addedByUsername: 'Dana', recentVisits: [] },
    { id: 'c', soldDate: '2026-02-05', addedByUsername: 'Rio', recentVisits: [visit('2026-03-01', [80])] },
  ]);
  check('conversion counts customers, not visits', r.converted, 2);
  check('conversion rate rounds to a percent', r.conversionRate, 67);
  check('revenue sums labour and parts', r.revenue, 240);
  check('revenue per sold customer spreads across all three', r.revenuePerSoldCustomer, 80);
  // Jan 10 -> Apr 1 is 81 days; Feb 5 -> Mar 1 is 24. Median of the two is 52.5.
  check('median days to first visit', r.medianDaysToFirstVisit, 53);
  check('per-salesperson split', r.bySalesperson.map((b) => [b.key, b.sold, b.converted]), [
    ['Dana', 2, 1],
    ['Rio', 1, 1],
  ]);
  check('per-month-sold split', r.byMonthSold.map((b) => b.key), ['2026-01', '2026-02']);
}

// Revenue coverage — most imported history has no price lines at all.
{
  const r = computeSalesToService([
    { id: 'a', soldDate: '2026-01-01', recentVisits: [visit('2026-02-01', [100]), visit('2026-03-01')] },
  ]);
  check('coverage reports how much of the history had prices', r.revenueDataCoverage, 50);
  check('a visit with no price data still counts as a visit', r.rows[0].visits, 2);
}
{
  const r = computeSalesToService([{ id: 'a', soldDate: '2026-01-01', recentVisits: [] }]);
  check('coverage is null when nothing was counted', r.revenueDataCoverage, null);
}

// Comparing cohorts fairly.
{
  const rows = [
    { id: 'old', soldDate: '2023-01-01', recentVisits: [visit('2025-06-01')] },
    { id: 'new', soldDate: '2026-08-01', recentVisits: [] },
  ];
  check('without a horizon the old cohort converts', computeSalesToService(rows).converted, 1);
  check('within 180 days it does not', computeSalesToService(rows, { withinDays: 180 }).converted, 0);
}

// Filters.
{
  const rows = [
    { id: 'a', soldDate: '2026-01-10', recentVisits: [] },
    { id: 'b', soldDate: '2026-05-10', recentVisits: [] },
  ];
  check('soldFrom filters the cohort', computeSalesToService(rows, { soldFrom: '2026-03-01' }).sold, 1);
  check('soldTo filters the cohort', computeSalesToService(rows, { soldTo: '2026-03-01' }).sold, 1);
  check(
    'excluded records are dropped',
    computeSalesToService(rows, { isExcluded: (c) => c.id === 'a' }).sold,
    1
  );
}

// Bad input.
{
  const r = computeSalesToService([
    { id: 'a', soldDate: '', recentVisits: [] },
    { id: 'b', soldDate: 'not-a-date', recentVisits: [] },
    { id: 'c', soldDate: '2026-01-01', recentVisits: null },
  ]);
  check('customers without a usable sold date are skipped', r.sold, 1);
  check('a null visit list does not throw', r.converted, 0);
}

console.log('\nAppointment show rate');

check('name key ignores order and punctuation', nameKey('MENDOZA, JOSE'), nameKey('Jose Mendoza'));
check('name key drops single letters', nameKey('Jose R Mendoza'), 'jose|mendoza');

{
  const customers = [
    { firstName: 'Jose', lastName: 'Mendoza', recentVisits: [{ date: '2026-09-10' }] },
    { firstName: 'Ada', lastName: 'Okonkwo', recentVisits: [{ date: '2026-09-11' }] },
  ];
  const appts = [
    { date: '2026-09-10', customerName: 'MENDOZA, JOSE', advisor: 'Frank' },
    { date: '2026-09-10', customerName: 'OKONKWO, ADA', advisor: 'Frank' },
    { date: '2026-09-11', customerName: 'OKONKWO, ADA', advisor: 'Lemmy' },
  ];
  const r = computeShowRate(appts, customers);
  check('an RO on the day counts as shown', r.showed, 2);
  check('an appointment with no RO that day is a no-show', r.noShow, 1);
  check('show rate is a rounded percent', r.showRate, 67);
  check('per-advisor split', r.byAdvisor.map((b) => [b.key, b.scheduled, b.showed]), [
    ['Frank', 2, 1],
    ['Lemmy', 1, 1],
  ]);
  check('per-weekday split names the day', r.byWeekday.map((b) => b.key), ['Thursday', 'Friday']);
}

// A name we do not recognise cannot be judged either way.
{
  const r = computeShowRate(
    [{ date: '2026-09-10', customerName: 'NOBODY, AT ALL' }],
    [{ firstName: 'Jose', lastName: 'Mendoza', recentVisits: [] }]
  );
  check('an unknown name is set aside, not called a no-show', r.unmatchedNames, 1);
  check('and is left out of the rate entirely', r.scheduled, 0);
  check('show rate is null when nothing could be judged', r.showRate, null);
}

// A customer we hold no service history for cannot be judged. This used to be
// scored a no-show, which is how a car that was never linked to PBS counted
// against the advisor who booked it.
{
  const r = computeShowRate(
    [{ date: '2026-09-10', customerName: 'Jose Mendoza' }],
    [{ firstName: 'Jose', lastName: 'Mendoza', recentVisits: [] }]
  );
  check('a customer with no history at all is set aside', r.noVisitHistory, 1);
  check('and is not called a no-show', r.noShow, 0);
  check('and is left out of the rate', r.scheduled, 0);
}

// A customer who does come in, just not that day, is a genuine no-show.
{
  const r = computeShowRate(
    [{ date: '2026-09-10', customerName: 'Jose Mendoza' }],
    [{ firstName: 'Jose', lastName: 'Mendoza', recentVisits: [{ date: '2026-08-02', openedDate: '2026-08-01' }] }]
  );
  check('a customer with history who skipped the day is a no-show', r.noShow, 1);
  check('and is counted in the rate', r.scheduled, 1);
  check('and not set aside', r.noVisitHistory, 0);
}

// --- the day they arrived, not the day they paid --------------------------
// The bug this fixes: a car booked on the 1st, opened on the 1st and cashiered
// on the 3rd scored as a no-show, because the visit's date is the cashier date.
// Only same-day cashiers — waiters and quick lube — could ever count as kept,
// which read as a 7% show rate across a whole month.
{
  const customers = [
    {
      firstName: 'Jose',
      lastName: 'Mendoza',
      recentVisits: [{ date: '2026-09-03', openedDate: '2026-09-01' }],
    },
  ];
  const r = computeShowRate([{ date: '2026-09-01', customerName: 'MENDOZA, JOSE' }], customers);
  check('a car kept two days counts as kept on the day it arrived', r.showed, 1);
  check('and is not a no-show', r.noShow, 0);
}
{
  const customers = [
    {
      firstName: 'Jose',
      lastName: 'Mendoza',
      recentVisits: [{ date: '2026-09-03', openedDate: '2026-09-01' }],
    },
  ];
  const r = computeShowRate([{ date: '2026-09-03', customerName: 'MENDOZA, JOSE' }], customers);
  check('the cashier date alone does not count as turning up', r.showed, 0);
}
{
  // Visits stored before the arrival date existed still have to work.
  const customers = [
    { firstName: 'Ada', lastName: 'Okonkwo', recentVisits: [{ date: '2026-09-11' }] },
  ];
  const r = computeShowRate([{ date: '2026-09-11', customerName: 'OKONKWO, ADA' }], customers);
  check('an older visit with no arrival date falls back to the date it has', r.showed, 1);
}
{
  // A waiter: opened and cashiered the same day. Must still count.
  const customers = [
    {
      firstName: 'Ada',
      lastName: 'Okonkwo',
      recentVisits: [{ date: '2026-09-11', openedDate: '2026-09-11' }],
    },
  ];
  const r = computeShowRate([{ date: '2026-09-11', customerName: 'OKONKWO, ADA' }], customers);
  check('a same-day car still counts as kept', r.showed, 1);
}

// Same customer, different day.
{
  const r = computeShowRate(
    [{ date: '2026-09-10', customerName: 'Jose Mendoza' }],
    [{ firstName: 'Jose', lastName: 'Mendoza', recentVisits: [{ date: '2026-09-12' }] }]
  );
  check('a visit on a different day is not a show', r.showed, 0);
}

// Bad input.
{
  const r = computeShowRate([{ date: '', customerName: 'X' }, null], []);
  check('empty dates and null rows do not throw', r.scheduled, 0);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
