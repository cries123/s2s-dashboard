/**
 * Tests for moving service visits out of the customer record.
 *
 * The instruction for this change was "don't delete any service visits", so
 * most of what is here is that one property checked from several directions:
 * every visit that goes in comes out, nothing already stored is overwritten,
 * and the old array is only ever cleared when every visit in it is verifiably
 * stored somewhere else.
 *
 * Run: npm run test:visitstore
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-visitstore-'));
const build = async (src, name) => {
  const out = join(outDir, `${name}.mjs`);
  await esbuild.build({ entryPoints: [src], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
};
const store = await build('src/lib/visitStore.ts', 'store');
const access = await build('src/lib/customerVisits.ts', 'access');

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

const NOW = '2026-10-14T00:00:00.000Z';
const pbs = (so, date, extra = {}) => ({ id: `pbs-${so}`, soNumber: so, date, mileage: 0, advisor: 'FRANK', requests: 'Service', ...extra });
const imported = (id, date, extra = {}) => ({ id, soNumber: '', date, requests: 'Imported visit', ...extra });
const oil = { requests: 'LOF', mileage: 30000 };
const priced = (labour, part) => ({ lines: [{ labourLines: [{ price: labour }], partLines: [{ price: part }] }] });

// --- ids: one document per visit, never two visits on one -----------------------
{
  const visits = [pbs('100', '2026-01-01'), pbs('101', '2026-02-01'), imported('csv-1', '2019-01-01')];
  const ids = store.assignVisitDocIds(visits).map((a) => a.docId);
  check('a synced visit keeps the id the sync uses', ids[0], 'pbs-100');
  check('an imported visit keeps its own id', ids[2], 'csv-1');
  check('every visit gets an id', ids.length, 3);
}
{
  // The dangerous case: two different visits that would land on one document.
  const visits = [imported('dup', '2019-01-01'), imported('dup', '2019-06-01'), imported('dup', '2020-01-01')];
  const ids = store.assignVisitDocIds(visits).map((a) => a.docId);
  check('colliding ids are told apart rather than merged', ids, ['dup', 'dup-2', 'dup-3']);
  check('so no visit is written over another', new Set(ids).size, 3);
}
{
  const visits = [imported('', '2019-01-01', { soNumber: 'A7' }), imported('', '2019-02-01'), imported('', '')];
  const ids = store.assignVisitDocIds(visits).map((a) => a.docId);
  check('no id falls back to the RO number', ids[0], 'so-A7');
  check('no id or RO falls back to the date', ids[1], 'd-2019-02-01');
  check('nothing at all still gets an id', ids[2], 'undated');
}
{
  const visits = [imported('a/b', '2019-01-01'), imported('.', '2019-01-02')];
  const ids = store.assignVisitDocIds(visits).map((a) => a.docId);
  check('a slash cannot become a path', ids[0], 'a_b');
  check('a reserved id is not used', ids[1], 'd-2019-01-02');
}
{
  const visits = [imported('dup', '2019-01-01'), imported('dup', '2019-06-01'), pbs('5', '2026-01-01')];
  const first = store.assignVisitDocIds(visits).map((a) => a.docId);
  const again = store.assignVisitDocIds(visits).map((a) => a.docId);
  check('the same list always gives the same ids, so a rerun lands on the same documents', again, first);
}

// --- planning the copy ---------------------------------------------------------------
{
  const embedded = [pbs('100', '2026-01-01'), pbs('101', '2026-02-01'), imported('csv-1', '2019-01-01')];
  const plan = store.planVisitMigration(embedded, new Set());
  check('with nothing stored yet, everything is copied', plan.toCopy.map((c) => c.docId), ['pbs-100', 'pbs-101', 'csv-1']);
  check('and every visit must exist afterwards', plan.mustExist.length, embedded.length);
}
{
  // The sync already wrote pbs-101, possibly a newer version. It must not be touched.
  const embedded = [pbs('100', '2026-01-01'), pbs('101', '2026-02-01')];
  const plan = store.planVisitMigration(embedded, new Set(['pbs-101']));
  check('a visit already stored is not overwritten with the older copy', plan.toCopy.map((c) => c.docId), ['pbs-100']);
  check('it is recorded as already there', plan.alreadyStored, ['pbs-101']);
  check('but it is still required to exist before the array goes', plan.mustExist, ['pbs-100', 'pbs-101']);
}
{
  const embedded = Array.from({ length: 300 }, (_, i) => imported(i % 7 === 0 ? 'same' : `v${i}`, '2020-01-01'));
  const plan = store.planVisitMigration(embedded, new Set());
  check('a full 300-visit array: every visit is accounted for', plan.mustExist.length, 300);
  check('and every one has its own document', new Set(plan.mustExist).size, 300);
  check('copied plus already-stored is the whole array', plan.toCopy.length + plan.alreadyStored.length, 300);
}

// --- the gate on clearing the old array ---------------------------------------------
{
  const must = ['pbs-1', 'pbs-2', 'csv-1'];
  check('all stored: the array may go', store.verifyVisitMigration(must, new Set(must)).ok, true);
  const short = store.verifyVisitMigration(must, new Set(['pbs-1', 'pbs-2']));
  check('one missing: the array stays', short.ok, false);
  check('and the missing one is named', short.missing, ['csv-1']);
  check('nothing stored at all: the array stays', store.verifyVisitMigration(must, new Set()).ok, false);
  check('an empty array has nothing to lose', store.verifyVisitMigration([], new Set()).ok, true);
}

// --- the summary -----------------------------------------------------------------------
{
  const visits = [
    pbs('100', '2026-01-01', { ...oil, ...priced(80, 40) }),
    pbs('101', '2026-05-01', priced(200, 0)),
    imported('csv-1', '2019-01-01'),
  ];
  const s = store.summarizeVisits(visits, NOW);
  check('every dated visit is counted', s.entries.length, 3);
  check('newest first', s.entries.map((e) => e.date), ['2026-05-01', '2026-01-01', '2019-01-01']);
  check('an oil change is marked', s.entries.find((e) => e.id === 'pbs-100').oil, true);
  check('with its mileage', s.entries.find((e) => e.id === 'pbs-100').miles, 30000);
  check('revenue is labour plus parts', s.entries.find((e) => e.id === 'pbs-100').rev, 120);
  check('a visit with no prices carries no revenue rather than zero', 'rev' in s.entries.find((e) => e.id === 'csv-1'), false);
  check('a visit that is not an oil change carries no mileage', 'miles' in s.entries.find((e) => e.id === 'pbs-101'), false);
  check('the last visit is the newest', s.last.id, 'pbs-101');
}
{
  // An imported copy of a visit the sync also has: count it once, keep both stored.
  const visits = [pbs('100', '2025-03-03', priced(100, 0)), imported('csv-9', '2025-03-03', priced(100, 0))];
  const s = store.summarizeVisits(visits, NOW);
  check('an imported copy of a synced visit is counted once', s.entries.length, 1);
  check('the synced one is the one kept', s.entries[0].id, 'pbs-100');
  check('so its revenue is not doubled', s.entries.reduce((t, e) => t + (e.rev ?? 0), 0), 100);
}
{
  // Two imported visits on one day are two visits; only a synced match folds.
  const s = store.summarizeVisits([imported('a', '2019-01-01'), imported('b', '2019-01-01')], NOW);
  check('two imported visits on the same day both count', s.entries.length, 2);
}

// --- adding to a summary --------------------------------------------------------------
{
  const base = store.summarizeVisits([pbs('100', '2026-01-01'), imported('csv-1', '2019-01-01')], NOW);
  const next = store.mergeIntoSummary(base, [{ docId: 'pbs-102', visit: pbs('102', '2026-09-01') }], NOW);
  check('a new visit is added', next.entries.map((e) => e.id), ['pbs-102', 'pbs-100', 'csv-1']);
  check('nothing that was there is dropped', base.entries.every((e) => next.entries.some((n) => n.id === e.id)), true);
  check('and the last visit moves forward', next.last.id, 'pbs-102');
}
{
  const base = store.summarizeVisits([pbs('100', '2026-01-01')], NOW);
  const next = store.mergeIntoSummary(base, [{ docId: 'pbs-100', visit: pbs('100', '2026-01-01', priced(50, 25)) }], NOW);
  check('a re-pulled visit replaces its own entry, not adds a second', next.entries.length, 1);
  check('with the newer figures', next.entries[0].rev, 75);
}
{
  const next = store.mergeIntoSummary(null, [{ docId: 'pbs-1', visit: pbs('1', '2026-01-01') }], NOW);
  check('a customer with no summary yet gets one', next.entries.length, 1);
  const older = store.mergeIntoSummary(next, [{ docId: 'pbs-0', visit: pbs('0', '2020-01-01') }], NOW);
  check('an older visit arriving does not become the last visit', older.last.id, 'pbs-1');
}

// --- reading: the same answers before and after a customer moves ---------------------
{
  const visits = [
    pbs('100', '2026-01-01', oil),
    pbs('101', '2026-05-01'),
    pbs('102', '2025-06-01', { ...oil, mileage: 25000 }),
    imported('csv-1', '2019-01-01'),
  ];
  const before = { recentVisits: visits };
  const after = { visitSummary: store.summarizeVisits(visits, NOW) };
  check('visit count is the same either side of the move', access.visitCount(after), access.visitCount(before));
  check('dates are the same', access.visitDates(after), access.visitDates(before));
  check('last visit date is the same', access.lastVisitDate(after), access.lastVisitDate(before));
  check('oil changes are the same', access.oilChangeVisits(after), access.oilChangeVisits(before));
  check('oil changes come oldest first', access.oilChangeVisits(after).map((v) => v.date), ['2025-06-01', '2026-01-01']);
  check('with their mileage', access.oilChangeVisits(after).map((v) => v.mileage), [25000, 30000]);
}
{
  const visits = [pbs('100', '2026-01-01')];
  const both = { recentVisits: [], visitSummary: store.summarizeVisits(visits, NOW) };
  check('a migrated customer reads from the summary', access.visitCount(both), 1);
  const stale = { recentVisits: [pbs('9', '2020-01-01')], visitSummary: store.summarizeVisits(visits, NOW) };
  check('the summary wins when both are present', access.lastVisitDate(stale), '2026-01-01');
}
{
  // A visit with no date is stored like any other, so it has to count like one.
  const visits = [pbs('100', '2026-01-01'), imported('csv-x', ''), imported('csv-y', 'garbage')];
  const s = store.summarizeVisits(visits, NOW);
  check('an undated visit still counts', s.entries.length, 3);
  check('undated visits sort after dated ones', s.entries.map((e) => e.date), ['2026-01-01', '', '']);
  const c = { visitSummary: s };
  check('the count includes it', access.visitCount(c), 3);
  check('but it has no date to list', access.visitDates(c), ['2026-01-01']);
  check('and it never becomes the last visit date', access.lastVisitDate(c), '2026-01-01');
  check('a customer whose only visit is undated has no last date, not an empty one', access.lastVisitDate({ visitSummary: store.summarizeVisits([imported('u', '')], NOW) }), null);
  check('and the count is the same before the move as after', access.visitCount({ recentVisits: visits }), 3);
}
// --- the spreadsheet import's dates ----------------------------------------------
check('an import date with a time reads', store.visitDay('09/09/2025 1:29:30 PM'), '2025-09-09');
check('without a time', store.visitDay('12/11/2023'), '2023-12-11');
check('single-digit month and day', store.visitDay('9/9/2025'), '2025-09-09');
check('ISO still reads', store.visitDay('2026-07-07'), '2026-07-07');
check('an impossible month is not a date', store.visitDay('13/01/2025'), '');
check('nonsense is not a date', store.visitDay('soon'), '');
{
  const c = { recentVisits: [{ id: 'csv-1', soNumber: '113835', date: '09/09/2025 1:29:30 PM' }] };
  check('an imported customer now has a last visit date', access.lastVisitDate(c), '2025-09-09');
}

// --- one repair order, two copies: shown once, as PBS's -------------------------------
{
  // Steven Reyes: the thin imported row and PBS's full copy of RO 113835.
  const visits = [
    { id: 'csv-7', soNumber: '113835', date: '09/09/2025 1:29:30 PM', requests: 'FS99 - OIL' },
    pbs('113835', '2025-09-09', priced(80, 40)),
    { id: 'csv-8', soNumber: '100001', date: '01/05/2024 9:00:00 AM' },
  ];
  const s = store.summarizeVisits(visits, NOW);
  check('the imported copy of a PBS repair order is counted once', s.entries.length, 2);
  check('as the PBS one', s.entries.some((e) => e.id === 'pbs-113835') && !s.entries.some((e) => e.id === 'csv-7'), true);
  check('an imported visit PBS does not have still counts', s.entries.some((e) => e.id === 'csv-8'), true);
  const shown = store.foldImportedDuplicates(visits, (v) => v.id);
  check('the history list shows PBS’s copy, not both', shown.map((v) => v.id), ['pbs-113835', 'csv-8']);
  check('folding only hides — the input list is untouched', visits.length, 3);
}
{
  // The RO number matches even with stray zeros or spaces.
  const shown = store.foldImportedDuplicates(
    [{ id: 'csv-1', soNumber: ' 0113835 ' }, pbs('113835', '2025-09-09')],
    (v) => v.id
  );
  check('RO numbers match despite padding', shown.length, 1);
}
{
  // Two different imported ROs on the day PBS has a third: all kept.
  const shown = store.foldImportedDuplicates(
    [{ id: 'csv-1', soNumber: '500', date: '2025-01-01' }, { id: 'csv-2', soNumber: '501', date: '2025-01-01' }, pbs('502', '2025-01-01')],
    (v) => v.id
  );
  check('different RO numbers on one day are different visits', shown.length, 3);
}

// --- a summary written under the old date rules heals --------------------------------
{
  // Susan Vick, as this morning's sync left her: two imported visits undated in
  // the summary because it was built before the import's dates could be read.
  const embedded = [
    pbs('900', '2026-10-14'),
    { id: 'csv-a', soNumber: '700', date: '03/04/2024 10:00:00 AM' },
    { id: 'csv-b', soNumber: '701', date: '05/06/2023 2:00:00 PM' },
  ];
  const stale = {
    version: 1,
    entries: [
      { id: 'pbs-900', date: '2026-10-14', so: '900', rev: 99 },
      { id: 'csv-a', date: '' },
      { id: 'csv-b', date: '' },
    ],
    last: null,
    updatedAt: 'x',
  };
  const healed = store.refreshSummaryFromEmbedded(stale, embedded, NOW);
  check('stale imported entries get their dates back', healed.entries.map((e) => e.date), ['2026-10-14', '2024-03-04', '2023-05-06']);
  check('nothing is lost in the refresh', healed.entries.length, 3);
  check("the sync's synced entry is kept as it was", healed.entries[0].rev, 99);
  check('and the customer has a real last visit date again', access.lastVisitDate({ visitSummary: healed }), '2026-10-14');
  check('no summary yet: built from the array', store.refreshSummaryFromEmbedded(null, embedded, NOW).entries.length, 3);
}

check('no history at all reads as none, not an error', access.visitCount({}), 0);
check('a null array reads as none', access.visitCount({ recentVisits: null }), 0);
check('no history has no last visit', access.lastVisitDate({}), null);

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
