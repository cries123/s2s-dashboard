/**
 * Appointment show-up rate.
 *
 * The last version of this number read 7% and had to be taken down. These
 * pin down the rules that replace it: PBS's own Transfer status means they came
 * in; an Open appointment only counts against anyone once its day has passed;
 * voided ones are not counted at all.
 *
 * Run: npm run test:showup
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-showup-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['src/lib/appointmentShowUp.ts'],
  bundle: true,
  format: 'esm',
  outfile: entry,
  logLevel: 'error',
});
const { showUpOutcome, summarizeShowUp, previousMonthKey } = await import(pathToFileURL(entry).href);

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

const TODAY = '2026-10-15';

// --- one appointment at a time --------------------------------------------------------
check('Transfer = they came in', showUpOutcome({ status: 'Transfer' }, '2026-10-14', TODAY), 'showed');
check('Transfer today = they came in', showUpOutcome({ status: 'Transfer' }, TODAY, TODAY), 'showed');
check('Open on a past day = no-show', showUpOutcome({ status: 'Open' }, '2026-10-14', TODAY), 'noShow');
check('Open today = not judged yet, they may still come', showUpOutcome({ status: 'Open' }, TODAY, TODAY), 'upcoming');
check('Open in the future = not judged', showUpOutcome({ status: 'Open' }, '2026-10-20', TODAY), 'upcoming');
check(
  'Open on a past day, but a repair order was opened for that car that day = came in',
  showUpOutcome({ status: 'Open', arrived: true }, '2026-10-14', TODAY),
  'showed'
);
check('Void = cancelled, not counted', showUpOutcome({ status: 'Void' }, '2026-10-14', TODAY), 'cancelled');
check('Cancelled = cancelled', showUpOutcome({ status: 'Cancelled' }, '2026-10-14', TODAY), 'cancelled');
check('a missing status reads as Open', showUpOutcome({}, '2026-10-14', TODAY), 'noShow');
check('upper case from PBS still reads', showUpOutcome({ status: 'TRANSFER' }, '2026-10-14', TODAY), 'showed');
check('a status never seen before is set aside', showUpOutcome({ status: 'Pending' }, '2026-10-14', TODAY), 'unknown');

// --- a month -----------------------------------------------------------------------
// Shaped like September 2026 on the live schedule: 281 Transfer, 48 Open, 47 Void.
const days = [];
const push = (status, n, date) => {
  let day = days.find((d) => d.date === date);
  if (!day) days.push((day = { date, appointments: [] }));
  for (let i = 0; i < n; i++) day.appointments.push({ status, customerName: `CUSTOMER ${status} ${i}`, advisor: 'FRANK' });
};
push('Transfer', 281, '2026-09-10');
push('Open', 48, '2026-09-11');
push('Void', 47, '2026-09-12');
const sep = summarizeShowUp(days, TODAY);
check('September: showed', sep.showed, 281);
check('September: no-shows', sep.noShow, 48);
check('September: voided ones left out', sep.cancelled, 47);
check('September: booked excludes voids', sep.booked, 329);
check('September: rate is 281 of 329', sep.rate, 85);
check('September: every no-show is listed', sep.noShows.length, 48);
check('September: three days of schedule', sep.days, 3);

// --- the month in progress ------------------------------------------------------------
const oct = summarizeShowUp(
  [
    { date: '2026-10-14', appointments: [{ status: 'Transfer' }, { status: 'Open', customerName: 'SMITH, ANN', advisor: 'LEMMY' }] },
    { date: TODAY, appointments: [{ status: 'Transfer' }, { status: 'Open' }] },
    { date: '2026-10-20', appointments: [{ status: 'Open' }, { status: 'Void' }] },
  ],
  TODAY
);
check("today's and later Open appointments are not counted against anyone", oct.upcoming, 2);
check('rate uses only days that have happened', oct.rate, 67);
check('the no-show is named', oct.noShows.map((n) => `${n.date} ${n.customerName} ${n.advisor}`), ['2026-10-14 SMITH, ANN LEMMY']);

const byRo = summarizeShowUp([{ date: '2026-10-14', appointments: [{ status: 'Open', arrived: true }, { status: 'Transfer' }] }], TODAY);
check('a same-day repair order counts as showing up', byRo.showed, 2);
check('and is counted separately so the card can say so', byRo.showedByRepairOrder, 1);

check('nothing has happened yet = no rate, not 0%', summarizeShowUp([{ date: '2026-10-20', appointments: [{ status: 'Open' }] }], TODAY).rate, null);
check('no schedule at all = no rate', summarizeShowUp([], TODAY).rate, null);

// --- months -------------------------------------------------------------------------
check('month before October', previousMonthKey('2026-10'), '2026-09');
check('month before January is December of the year before', previousMonthKey('2026-01'), '2025-12');

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
