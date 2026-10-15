/**
 * Tests for "one profile per VIN".
 *
 * Jaryn's rule: every VIN has its own profile with an owner; the same person's
 * different cars stay separate; a repair order goes to its car's profile, and
 * one is created if there isn't one — never skipped.
 *
 * Run: npm run test:profiles
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-profiles-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({ entryPoints: ['server/pbs/pbsVehicleProfilePlan.ts'], bundle: true, format: 'esm', platform: 'node', outfile: entry, logLevel: 'error' });
const { planVehicleProfiles, normalizeVehicleRef } = await import(pathToFileURL(entry).href);

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

const facts = (entries) => new Map(entries.map(([ref, f]) => [normalizeVehicleRef(ref), f]));
const profile = (id, extra = {}) => ({ id, vinLast8: '', vehicleRefs: [], visitCount: 0, ...extra });
const plan = (vehicles, f, profiles) => planVehicleProfiles(vehicles, f, profiles);
/** Every vehicle in the plan ends up somewhere — attached or created. */
const placed = (p) => p.attaches.length + p.creates.length;

const STEVEN_VIN = '5NPEB4AC6FA124198';
const STEVEN = profile('steven', { vinLast8: 'FA124198', make: 'HYUNDAI', visitCount: 3 });

// --- the import's profile gets its car's repair orders ------------------------------
{
  const p = plan([{ vehicleRef: 'V1', contactRef: 'C1' }], facts([['V1', { vin: STEVEN_VIN, make: 'Hyundai' }]]), [STEVEN]);
  check("Steven's repair order goes to his profile", p.attaches.map((a) => a.customerId), ['steven']);
  check('the PBS car is tied to it', p.attaches[0].addRef, true);
  check('and his full VIN filled in', p.attaches[0].fillVin, STEVEN_VIN);
  check('nothing new is created', p.creates.length, 0);
}

// --- no profile for that VIN: make one, don't skip -----------------------------------
{
  const p = plan([{ vehicleRef: 'V9', contactRef: 'C9' }], facts([['V9', { vin: 'KMHXX00XX9A000001' }]]), [STEVEN]);
  check('a car with no profile gets one', p.creates.length, 1);
  check('owned by the person on the repair order', p.creates[0].contactRef, 'C9');
  check('with its VIN', p.creates[0].vin, 'KMHXX00XX9A000001');
  check('and the repair order is not dropped', placed(p), 1);
  check('reason recorded', p.creates[0].reason, 'no-profile');
}
{
  const p = plan([{ vehicleRef: 'V0', contactRef: 'C0' }], facts([]), []);
  check('no VIN from PBS still gets a profile', p.creates.map((c) => c.reason), ['no-vin']);
}

// --- one owner, two cars: two profiles --------------------------------------------------
{
  // Isi Omofoma: a profile for one car; a repair order for a different car of hers.
  const isiCar1 = profile('isi-1', { vinLast8: 'HU311422', vin: 'KMHTC6AD0HU311422', make: 'HYUNDAI', vehicleRefs: ['VA'] });
  const p = plan([{ vehicleRef: 'VB', contactRef: 'ISI' }], facts([['VB', { vin: 'KMHTG6AFXKU008984', make: 'HYUNDAI' }]]), [isiCar1]);
  check("a second car of the same owner gets its own profile", p.creates.length, 1);
  check("and doesn't touch the first car's", p.attaches.length, 0);
}
{
  // Same last 8 but a different full VIN: a different car.
  const other = profile('other', { vinLast8: 'FA124198', vin: 'KMHXX00XXFA124198' });
  const p = plan([{ vehicleRef: 'V1' }], facts([['V1', { vin: STEVEN_VIN }]]), [other]);
  check('same last 8, different full VIN: a new profile', p.creates.map((c) => c.reason), ['different-car']);
}
{
  const p = plan([{ vehicleRef: 'V1' }], facts([['V1', { vin: STEVEN_VIN, make: 'TOYOTA' }]]), [STEVEN]);
  check('makes disagree: a different car, a new profile', p.creates.map((c) => c.reason), ['different-car']);
  check("and Steven's profile is left alone", p.attaches.length, 0);
}
{
  // Only the last 8, already tied to another PBS car — can't confirm, so kept apart.
  const tiedTail = profile('tied', { vinLast8: 'FA124198', vehicleRefs: ['SOMETHING-ELSE'] });
  const p = plan([{ vehicleRef: 'V1' }], facts([['V1', { vin: STEVEN_VIN }]]), [tiedTail]);
  check("a last-8 profile tied to another car isn't merged into this one", p.creates.length, 1);
}

// --- the same car twice (import + sync) -----------------------------------------------
{
  // Michael Brown: the import's profile and the sync's, for one Elantra.
  const imported = profile('mb-import', { vinLast8: 'RU692838', visitCount: 8, createdAt: '2025-12-02' });
  const synced = profile('mb-pbs', { vinLast8: 'RU692838', vin: 'KMHLL4DG1RU692838', vehicleRefs: ['MB-CAR'], createdAt: '2026-10-06' });
  const p = plan([{ vehicleRef: 'MB-CAR' }], facts([['MB-CAR', { vin: 'KMHLL4DG1RU692838' }]]), [imported, synced]);
  check('a car already tied to a profile goes straight there', p.attaches.map((a) => a.customerId), ['mb-pbs']);
}
{
  const a = profile('dup-a', { vinLast8: 'FA124198', visitCount: 2, createdAt: '2025-12-01' });
  const b = profile('dup-b', { vinLast8: 'FA124198', visitCount: 9, createdAt: '2025-12-05' });
  const p = plan([{ vehicleRef: 'V1' }], facts([['V1', { vin: STEVEN_VIN }]]), [a, b]);
  check('two profiles for one car: goes to the one with the most history', p.attaches.map((x) => x.customerId), ['dup-b']);
  check('the other is flagged as its duplicate, not deleted', p.duplicates, [{ customerId: 'dup-a', duplicateOf: 'dup-b' }]);
  check('and the repair order is not skipped', placed(p), 1);
}
{
  // Exact full VIN beats a last-8 match when choosing which duplicate keeps the car.
  const tailOnly = profile('tail', { vinLast8: 'FA124198', visitCount: 50 });
  const exact = profile('exact', { vinLast8: 'FA124198', vin: STEVEN_VIN, visitCount: 1 });
  const p = plan([{ vehicleRef: 'V1' }], facts([['V1', { vin: STEVEN_VIN }]]), [tailOnly, exact]);
  check('the profile with the exact VIN keeps the car', p.attaches[0].customerId, 'exact');
  check('and needs no VIN filled in', p.attaches[0].fillVin, undefined);
}
{
  // PBS has two vehicle records for one VIN: both land on one profile.
  const p = plan(
    [{ vehicleRef: 'V1' }, { vehicleRef: 'V2' }],
    facts([['V1', { vin: STEVEN_VIN }], ['V2', { vin: STEVEN_VIN }]]),
    [STEVEN]
  );
  check('two PBS records for one VIN go to the same profile', p.attaches.map((a) => a.customerId), ['steven', 'steven']);
}
{
  // ...and with no profile yet, only ONE is created for both.
  const p = plan(
    [{ vehicleRef: 'V1' }, { vehicleRef: 'V2' }],
    facts([['V1', { vin: 'KMHXX00XX9A000001' }], ['V2', { vin: 'KMHXX00XX9A000001' }]]),
    []
  );
  check('one new profile for one car, however many PBS records', p.creates.length, 1);
  check('the second record attaches to it', p.attaches.map((a) => a.customerId), [p.creates[0].tempId]);
}

// --- two different cars sharing the last 8 ----------------------------------------------
{
  // One import profile with only the last 8; two different full VINs end in it.
  const p = plan(
    [{ vehicleRef: 'V1' }, { vehicleRef: 'V2' }],
    facts([['V1', { vin: STEVEN_VIN }], ['V2', { vin: '1HGCM8263FA124198' }]]),
    [STEVEN]
  );
  check('the test VINs really are 17 characters', [STEVEN_VIN.length, '1HGCM8263FA124198'.length], [17, 17]);
  check('the first car takes the profile', p.attaches.map((a) => a.customerId), ['steven']);
  check('the second, now a different full VIN, gets its own', p.creates.map((c) => c.reason), ['different-car']);
  check('both repair orders placed', placed(p), 2);
}

// --- every repair order lands somewhere -----------------------------------------------
{
  const vehicles = [
    { vehicleRef: 'a' }, { vehicleRef: 'b' }, { vehicleRef: 'c' }, { vehicleRef: 'd' }, { vehicleRef: 'a' },
  ];
  const p = plan(
    vehicles,
    facts([['a', { vin: STEVEN_VIN }], ['b', { vin: 'X' }], ['c', { vin: 'KMHXX00XX9A000002' }]]),
    [STEVEN]
  );
  check('every distinct vehicle is placed exactly once — none skipped', placed(p), 4);
}
{
  const p = plan([{ vehicleRef: 'V1' }], facts([['V1', { vin: '5npeb4ac6fa124198' }]]), [profile('x', { vinLast8: 'fa124198' })]);
  check('VIN case does not matter', p.attaches.length, 1);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
