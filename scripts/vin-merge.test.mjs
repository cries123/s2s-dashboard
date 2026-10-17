/**
 * Folding one car's two profiles into one — the rules, on the shapes found in
 * production on 2026-10-16 (510 cars: an old spreadsheet import with the last 8
 * of the VIN, and a profile the PBS sync made, often named just "Customer").
 *
 * Jaryn's rule: the profile that came in most recently owns the car, and the
 * car's records go with it. Run: npm run test:vinmerge
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join('node_modules', '.s2s-vinmerge-'));
const build = async (entry, name) => {
  const out = join(outDir, `${name}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', packages: 'external', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
};
const P = await build('server/pbs/vinDuplicatePlan.ts', 'plan');
const M = await build('server/pbs/pbsCustomerMerge.ts', 'merge');

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); failed++; } else passed++;
}

const NOW = '2026-10-16T20:00:00.000Z';
const summary = (entries) => ({ version: 1, entries, last: null, updatedAt: NOW });
const pbsDoc = (so, date, extra = {}) => ({ id: `pbs-${so}`, data: { id: `pbs-${so}`, soNumber: so, date, mileage: 1000, requests: 'LOF', ...extra } });

// The PBS-made profile: full VIN, PBS link, no name, visits stored as documents.
const pbsProfile = (over = {}, docs = [pbsDoc('116128', '2026-03-03'), pbsDoc('114002', '2025-09-23')]) => ({
  id: 'PBS0JBa3NN3', visitDocs: docs,
  data: {
    firstName: '', lastName: 'Customer', phone: '', email: '', dealershipId: 'hyundai', addedBy: 'pbs-sync',
    vin: '1FMSK8DH2MGB18836', vinLast8: 'MGB18836', year: '2021', make: 'FORD', model: 'EXPLORER',
    pbsVehicleId: 'veh-1', pbsVehicleRefs: ['veh-1'], pbsContactId: 'con-1', soldDate: '', lastServiceDate: '2026-03-03',
    visitSummary: summary(docs.map((d) => ({ id: d.id, date: d.data.date, so: d.data.soNumber, oil: true }))),
    ...over,
  },
});
// The import: last 8 only, the real name, the old array — including the same RO a day earlier.
const importProfile = (over = {}, visits = [
  { id: '8jd7v6u', date: '03/10/2023 2:56:35 PM', soNumber: '102043', mileage: 44508, requests: 'LOF - PERFORM OIL/FILTER CHANGE' },
  { id: 'k2m9p1q', date: '03/02/2026 9:10:00 AM', soNumber: '116128', mileage: 90163, requests: 'LOF' },
]) => ({
  id: 'IMPPDsNBKDH', visitDocs: [],
  data: {
    firstName: 'JANET', lastName: 'GUERRA', phone: '8055550101', email: 'janet@example.com', dealershipId: 'hyundai',
    addedBy: 'admin-uid', vinLast8: 'MGB18836', year: '2021', make: 'Hyundai', model: 'EXPLORER', soldDate: '2021-05-02',
    lastServiceDate: '03/02/2026 9:10:00 AM', recentVisits: visits, lastContactOutcome: 'left_voicemail',
    lastServiceContact: '2026-04-01T17:00:00.000Z', lastContactUsername: 'Maria',
    ...over,
  },
});

// --- grouping ------------------------------------------------------------------------------
const g = P.groupCarsOnSeveralProfiles([
  { id: 'a', data: { vin: '1FMSK8DH2MGB18836', year: '2021', model: 'EXPLORER' } },
  { id: 'b', data: { vinLast8: 'mgb18836', year: '2021', model: 'Explorer XLT' } },
  { id: 'c', data: { vin: 'KM8JBCA16PU086050', year: '2023', model: 'TUCSON' } },
  { id: 'd', data: { vin: 'XXXXXXXXXPU086050', year: '2023', model: 'TUCSON' } },
  { id: 'e', data: { vinLast8: 'NU000001', year: '2022', model: 'ELANTRA' } },
  { id: 'f', data: { vinLast8: 'NU000001', year: '2019', model: 'ELANTRA' } },
  { id: 'h', data: { vinLast8: 'NU000002', year: '2022', model: 'ELANTRA' } },
  { id: 'i', data: { vinLast8: 'NU000002', year: '2022', model: 'SONATA' } },
  { id: 'j', data: { vinLast8: 'NU000003', mergedInto: 'k' } },
  { id: 'k', data: { vin: '5NPD74LF9NU000003' } },
]);
check('the same car by last 8 (full VIN on one, last 8 on the other)', g.groups, [{ tail: 'MGB18836', ids: ['a', 'b'] }]);
check('held back: two full VINs, two years, two models', g.skipped.map((s) => s.reason), [
  'Model years differ (2022 / 2019)', 'Models differ (ELANTRA / SONATA)', 'Different full VINs share the last 8',
]);
check('an already merged profile is not grouped again', g.groups.some((x) => x.tail === 'NU000003'), false);
const g2 = P.groupCarsOnSeveralProfiles([
  { id: 'a', data: { vinLast8: 'SH050201', year: '2025', model: 'SANTA FE' } },
  { id: 'b', data: { vin: '5NMP5DGL0SH050201', year: '2025', model: 'SANTAFE' } },
  { id: 'c', data: { vinLast8: 'RM039410', model: 'TACOMA 4WD' } },
  { id: 'd', data: { vinLast8: 'RM039410', model: 'TACOMA' } },
  { id: 'e', data: { vinLast8: 'RU187948', model: 'TUCSON HEV' } },
  { id: 'f', data: { vinLast8: 'RU187948', model: 'TUCSON HYBRID' } },
  { id: 'g', data: { vinLast8: 'PU183568', model: 'KONA EV' } },
  { id: 'h', data: { vinLast8: 'PU183568', model: 'KONA ELECTRIC' } },
  { id: 'i', data: { vinLast8: 'PU000070', model: 'GV70' } },
  { id: 'j', data: { vinLast8: 'PU000070', model: 'GV80' } },
  { id: 'k', data: { vinLast8: 'RIO00001', model: 'RIO' } },
  { id: 'l', data: { vinLast8: 'RIO00001', model: 'RIO 5-DOOR' } },
]);
check('one model, spelled differently: SANTA FE, TACOMA 4WD, TUCSON HEV/HYBRID, KONA EV/ELECTRIC, RIO', g2.groups.map((x) => x.tail), ['PU183568', 'RIO00001', 'RM039410', 'RU187948', 'SH050201']);
check('GV70 / GV80 held back', g2.skipped.map((x) => x.tail), ['PU000070']);

// --- people ----------------------------------------------------------------------------------
check('"Customer" is no name', P.isPlaceholderName({ firstName: '', lastName: 'Customer' }), true);
check('"Unknown Customer" is no name', P.isPlaceholderName({ firstName: 'Unknown', lastName: 'CUSTOMER' }), true);
check('the store is a name', P.isPlaceholderName({ firstName: '', lastName: 'HYUNDAI OF SANTA MARIA' }), false);
check('typo: RUBACALBA / RUBALCABA', P.samePerson({ firstName: 'JOSE', lastName: 'RUBACALBA' }, { firstName: 'JOSE', lastName: 'RUBALCABA' }), true);
check('fuller name: DAVID RIOS / DAVID GARCIA RIOS', P.samePerson({ firstName: 'DAVID', lastName: 'RIOS' }, { firstName: 'DAVID', lastName: 'GARCIA RIOS' }), true);
check('different people: MIN CHEN / DEBRA COLLINGWOOD', P.samePerson({ firstName: 'MIN', lastName: 'CHEN' }, { firstName: 'DEBRA', lastName: 'COLLINGWOOD' }), false);
check('same phone, different spelling', P.samePerson({ firstName: 'MARIBELL', lastName: 'LICEA', phone: '(805) 555-0199' }, { firstName: 'SOPHIA', lastName: 'CORONA', phone: '8055550199' }), true);

// --- Janet Guerra: PBS has no name; the same RO is on both, a day apart ----------------------------
{
  const plan = P.planCarMerge('MGB18836', [pbsProfile(), importProfile()], NOW);
  check('kept: the PBS profile (the sync finds a car by its PBS id)', plan.keepId, 'PBS0JBa3NN3');
  check('same visit on both, real name kept', plan.ownerReason, 'same visit on both — kept the record with the real name');
  check('owner is Janet', plan.ownerName, 'JANET GUERRA');
  check('not an ownership change', plan.ownerChanged, false);
  check('name, phone and email come over', [plan.keepPatch.firstName, plan.keepPatch.lastName, plan.keepPatch.phone, plan.keepPatch.email], ['JANET', 'GUERRA', '8055550101', 'janet@example.com']);
  check('sold date comes over (PBS had none)', plan.keepPatch.soldDate, '2021-05-02');
  check('her call history comes over (newer than none)', [plan.keepPatch.lastContactOutcome, plan.keepPatch.lastContactUsername], ['left_voicemail', 'Maria']);
  check('call notes move: same person', plan.copyContactLogFrom, ['IMPPDsNBKDH']);
  check('both imported visits are copied — nothing dropped', plan.visitCopies.map((c) => c.docId), ['8jd7v6u', 'k2m9p1q']);
  const s = plan.keepPatch.visitSummary;
  check('the summary counts RO 116128 once (PBS copy), adds the 2023 visit', s.entries.map((e) => `${e.id}:${e.date}`), ['pbs-116128:2026-03-03', 'pbs-114002:2025-09-23', '8jd7v6u:2023-03-10']);
  check('the VIN is already full; refs unchanged', [plan.keepPatch.vin, plan.keepPatch.pbsVehicleRefs], [undefined, undefined]);
  const mp = plan.mergePatches.IMPPDsNBKDH;
  check('merged profile: hidden, pointing at the kept one', [mp.mergedInto, mp.mergedVin], ['PBS0JBa3NN3', '1FMSK8DH2MGB18836']);
  check('merged profile: car and history cleared (copied, backed up)', [mp.vinLast8, mp.recentVisits, mp.visitSummary, mp.enableServiceAlert], [null, null, null, false]);
  check('merged profile: keeps its name for the record', 'firstName' in mp, false);
}

// --- Min Chen sold it; Debra Collingwood came in since ----------------------------------------------
{
  const debra = pbsProfile({ firstName: 'DEBRA', lastName: 'COLLINGWOOD', phone: '8055550300', lastServiceDate: '2026-09-11' }, [pbsDoc('117001', '2026-09-11')]);
  debra.data.visitSummary = summary([{ id: 'pbs-117001', date: '2026-09-11', so: '117001' }]);
  const min = importProfile({ firstName: 'MIN', lastName: 'CHEN', phone: '8055550400', stopAlertInfo: { reason: 'Do not call' }, lastServiceDate: '05/04/2026 10:00:00 AM' }, [
    { id: 'x1', date: '05/04/2026 10:00:00 AM', soNumber: '116900', requests: 'TIRE ROTATION' },
  ]);
  const plan = P.planCarMerge('MGB18836', [debra, min], NOW);
  check('Debra came in most recently: she keeps it', [plan.keepId, plan.ownerReason, plan.ownerName], ['PBS0JBa3NN3', 'newest visit', 'DEBRA COLLINGWOOD']);
  check('marked as a change of owner', plan.ownerChanged, true);
  check("Min's details stay off Debra's record", ['firstName', 'phone', 'lastContactOutcome', 'stopAlertInfo'].map((f) => f in plan.keepPatch), [false, false, false, false]);
  check("Min's call notes stay with Min", plan.copyContactLogFrom, []);
  check("the car's history comes over: Min's visit too", plan.visitCopies.map((c) => c.docId), ['x1']);
}

// --- Ellis Cameron: the import's visit is newer than the PBS record's (a dealer) ------------------------
{
  const dealer = pbsProfile({ firstName: '', lastName: 'SANTA MARIA CDJR DBA PITRE CALI LLC', phone: '8055550500', address: '1 Dealer Way', lastServiceDate: '2025-01-30' }, [pbsDoc('110000', '2025-01-30')]);
  dealer.data.visitSummary = summary([{ id: 'pbs-110000', date: '2025-01-30', so: '110000' }]);
  const ellis = importProfile({ firstName: 'ELLIS', lastName: 'CAMERON', phone: '8055550600', email: '', lastServiceDate: '08/13/2025 1:00:00 PM' }, [
    { id: 'e1', date: '08/13/2025 1:00:00 PM', soNumber: '112500', requests: 'LOF' },
  ]);
  const plan = P.planCarMerge('MGB18836', [dealer, ellis], NOW);
  check('Ellis came in most recently: the record becomes his', [plan.keepId, plan.ownerId, plan.ownerName], ['PBS0JBa3NN3', 'IMPPDsNBKDH', 'ELLIS CAMERON']);
  check("the dealer's phone and address are replaced, blanks cleared", [plan.keepPatch.phone, plan.keepPatch.address, plan.keepPatch.email], ['8055550600', null, null]);
  check('change of owner', plan.ownerChanged, true);
  check('last service date is his visit', plan.keepPatch.lastServiceDate, '2025-08-13');
}

// --- the same person, a typo apart; she asked not to be contacted --------------------------------------
{
  const pbs = pbsProfile({ firstName: 'JOSE', lastName: 'RUBALCABA', phone: '' });
  const imp = importProfile({ firstName: 'JOSE', lastName: 'RUBACALBA', enableServiceAlert: false, stopAlertInfo: { reason: 'Moved away' }, notes: 'Prefers texts' });
  const plan = P.planCarMerge('MGB18836', [pbs, imp], NOW);
  check('PBS spelling kept, phone filled', [plan.keepPatch.firstName, plan.keepPatch.phone], [undefined, '8055550101']);
  check('opt-out carried: alerts off, reason kept', [plan.keepPatch.enableServiceAlert, plan.keepPatch.stopAlertInfo], [false, { reason: 'Moved away' }]);
  check('notes carried', plan.keepPatch.notes, 'Prefers texts');
}

// --- two PBS records for one car: both refs kept, so the sync finds it either way -----------------------
{
  const a = pbsProfile({ firstName: 'JANET', lastName: 'GUERRA' });
  const b = { ...pbsProfile({ pbsVehicleId: 'veh-2', pbsVehicleRefs: ['veh-2'], firstName: 'JANET', lastName: 'GUERRA', lastServiceDate: '2025-09-23' }, [pbsDoc('114002', '2025-09-23'), pbsDoc('100001', '2023-01-05')]), id: 'PBS2' };
  b.data.visitSummary = summary([{ id: 'pbs-114002', date: '2025-09-23', so: '114002' }, { id: 'pbs-100001', date: '2023-01-05', so: '100001' }]);
  const plan = P.planCarMerge('MGB18836', [a, b], NOW);
  check('the newer one is kept', plan.keepId, 'PBS0JBa3NN3');
  check('both PBS vehicle ids on it', plan.keepPatch.pbsVehicleRefs, ['veh-1', 'veh-2']);
  check('an RO both store under the same id is not copied twice', [plan.visitsSameRepairOrder, plan.visitCopies.map((c) => c.docId)], [1, ['pbs-100001']]);
}

// --- run twice: a visit copied the first time is counted, not copied again ------------------------------
{
  const keep = pbsProfile({}, [
    pbsDoc('116128', '2026-03-03'), pbsDoc('114002', '2025-09-23'),
    { id: '8jd7v6u', data: { id: '8jd7v6u', date: '03/10/2023 2:56:35 PM', soNumber: '102043', movedFromCustomerId: 'IMPPDsNBKDH', movedFromVisitId: '8jd7v6u' } },
  ]);
  const plan = P.planCarMerge('MGB18836', [keep, importProfile()], NOW);
  check('second run: one already copied, one left', [plan.visitsAlreadyCopied, plan.visitCopies.map((c) => c.docId)], [1, ['k2m9p1q']]);
  check('second run: summary still has the 2023 visit', plan.keepPatch.visitSummary.entries.some((e) => e.id === '8jd7v6u'), true);
}

// --- an id clash with a different visit is renamed, never overwritten ------------------------------------
{
  const keep = pbsProfile({}, [pbsDoc('116128', '2026-03-03'), { id: '8jd7v6u', data: { id: '8jd7v6u', date: '2020-01-01', soNumber: '90000' } }]);
  const plan = P.planCarMerge('MGB18836', [keep, importProfile()], NOW);
  check('clash renamed', plan.visitCopies.map((c) => c.docId), ['8jd7v6u~IMPPDs', 'k2m9p1q']);
}

// --- the sync: PBS's "Customer" never replaces a real name --------------------------------------------------
{
  const existing = { firstName: 'JANET', lastName: 'GUERRA', phone: '8055550101', email: 'janet@example.com', pbsContactId: 'con-1', lastContactOutcome: 'left_voicemail' };
  const mapped = { firstName: '', lastName: 'Customer', phone: '', email: '', pbsContactId: 'con-1', vin: '1FMSK8DH2MGB18836' };
  const { patch, ownerChanged } = M.buildPbsCustomerUpdatePatch(existing, mapped, NOW);
  check('"Customer" from PBS is not a new owner', ownerChanged, false);
  check('the real name, phone and email stay', [patch.firstName, patch.lastName, patch.phone, patch.email], ['JANET', 'GUERRA', '8055550101', 'janet@example.com']);
  check('call history stays', patch.lastContactOutcome, 'left_voicemail');
  const named = M.buildPbsCustomerUpdatePatch({ firstName: '', lastName: 'Customer', pbsContactId: 'con-1' }, { firstName: 'ANA', lastName: 'LOPEZ', pbsContactId: 'con-1' }, NOW);
  check('PBS filling in a name is not a new owner either', [named.ownerChanged, named.patch.firstName], [false, 'ANA']);
  const sold = M.buildPbsCustomerUpdatePatch(existing, { firstName: 'DEBRA', lastName: 'COLLINGWOOD', phone: '', pbsContactId: 'con-9' }, NOW);
  check('a real new owner still replaces everything', [sold.ownerChanged, sold.patch.firstName, sold.patch.phone], [true, 'DEBRA', '']);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
