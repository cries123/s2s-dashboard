/**
 * Tests for service reminder date handling.
 *
 * These exist because a delivery date whose century went missing upstream
 * ("6/30/26" read as year 26) produced "730396 days past due" on the alert
 * card, and the malformed "26-12-30" it serialised to parsed as nothing at all.
 *
 * Run: npm run test:dates
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-dates-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['src/lib/serviceReminder.ts'],
  bundle: true,
  format: 'esm',
  outfile: entry,
  logLevel: 'error',
});
const {
  normalizeCenturyYear,
  parseCustomerDate,
  parseReminderDate,
  formatLocalDateOnly,
  computeServiceReminderDueDate,
  getLastServiceDate,
} = await import(pathToFileURL(entry).href);

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

const iso = (d) => (d ? formatLocalDateOnly(d) : null);

// --- the century that went missing -----------------------------------------
check('year 26 becomes 2026', iso(normalizeCenturyYear(new Date('0026-06-30T00:00:00'))), '2026-06-30');
check('year 99 becomes 2099', iso(normalizeCenturyYear(new Date('0099-01-01T00:00:00'))), '2099-01-01');
check('a four-digit year is left alone', iso(normalizeCenturyYear(new Date('1998-05-04T00:00:00'))), '1998-05-04');
check('null stays null', normalizeCenturyYear(null), null);

// --- formatting ------------------------------------------------------------
check(
  'a low year zero-pads instead of serialising as 26-12-30',
  formatLocalDateOnly(new Date('0026-12-30T00:00:00')),
  '0026-12-30'
);

// --- reading stored dates --------------------------------------------------
check('a normal stored date reads back', iso(parseCustomerDate('2026-06-30')), '2026-06-30');
check('a century-less stored date is salvaged', iso(parseCustomerDate('0026-06-30')), '2026-06-30');
check('a two-digit year string is salvaged', iso(parseCustomerDate('26-06-30')), '2026-06-30');
check('a timestamp string reads back', iso(parseCustomerDate('2026-06-30T14:00:00')), '2026-06-30');
check('an empty string is nothing, not today', parseCustomerDate(''), null);
check('undefined is nothing', parseCustomerDate(undefined), null);
check('garbage is nothing', parseCustomerDate('not a date'), null);
check('a Date passes through', iso(parseCustomerDate(new Date('2026-06-30T00:00:00'))), '2026-06-30');

check('parseReminderDate salvages 0026', iso(parseReminderDate('0026-12-30')), '2026-12-30');
check('parseReminderDate salvages 26-12-30', iso(parseReminderDate('26-12-30')), '2026-12-30');

// --- the bug on the card ---------------------------------------------------
// Delivered June 30, standard interval is six months, so the reminder is due
// Dec 30 of the SAME year — not two millennia ago.
check('a century-less delivery gives a 2026 due date', computeServiceReminderDueDate('0026-06-30'), '2026-12-30');
check('a two-digit delivery gives a 2026 due date', computeServiceReminderDueDate('26-06-30'), '2026-12-30');
check('a normal delivery is unchanged', computeServiceReminderDueDate('2026-06-30'), '2026-12-30');
check('a Date anchor works', computeServiceReminderDueDate(new Date('2026-06-30T00:00:00')), '2026-12-30');

{
  const due = parseReminderDate(computeServiceReminderDueDate('0026-06-30'));
  const daysOut = Math.round((due.getTime() - new Date('2026-10-02T12:00:00').getTime()) / 86_400_000);
  check('the due date is months away, not millennia', Math.abs(daysOut) < 400, true);
}

// --- last service date ----------------------------------------------------
check(
  'with no visits, the delivery date is the anchor',
  iso(getLastServiceDate({ soldDate: '0026-06-30', recentVisits: [] })),
  '2026-06-30'
);
check(
  'the newest visit wins',
  iso(getLastServiceDate({ soldDate: '2026-01-01', recentVisits: [{ date: '2026-03-04' }, { date: '2026-07-19' }] })),
  '2026-07-19'
);
check(
  'a century-less visit date is salvaged',
  iso(getLastServiceDate({ soldDate: '2026-01-01', recentVisits: [{ date: '0026-07-19' }] })),
  '2026-07-19'
);
check('no dates at all means no anchor', getLastServiceDate({ recentVisits: [] }), null);

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
