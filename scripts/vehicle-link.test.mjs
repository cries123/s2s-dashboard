/**
 * Tests for linking customers to their PBS vehicle from repair orders.
 *
 * A wrong link puts one person's service history on another person's record,
 * which is worse than no link at all. So most of these check refusals: every
 * case where the planner must decline rather than guess.
 *
 * Run: npm run test:link
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-link-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({ entryPoints: ['server/pbs/pbsVehicleLinkPlan.ts'], bundle: true, format: 'esm', platform: 'node', outfile: entry, logLevel: 'error' });
const { planVehicleLinks, indexCustomersByVinLast8, normalizeVehicleRef } = await import(pathToFileURL(entry).href);

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

// Steven Reyes, as he is stored: an imported record with only the last 8 of the VIN.
const STEVEN = { id: 'q6PRQ', vinLast8: 'FA124198', make: 'HYUNDAI' };
const STEVEN_VIN = '5NPEB4AC6FA124198';
const facts = (entries) => new Map(entries.map(([ref, f]) => [normalizeVehicleRef(ref), f]));
const plan = (vehicles, f, customers) => planVehicleLinks(vehicles, f, indexCustomersByVinLast8(customers));

// --- the case it exists for --------------------------------------------------------
{
  const p = plan([{ vehicleRef: 'VEH-STEVEN', contactRef: 'C-1' }], facts([['VEH-STEVEN', { vin: STEVEN_VIN, make: 'Hyundai' }]]), [STEVEN]);
  check('an imported customer is linked by the last 8 of the VIN', p.links.map((l) => l.customerId), ['q6PRQ']);
  check('with the PBS vehicle and contact', [p.links[0].vehicleRef, p.links[0].contactRef], ['VEH-STEVEN', 'C-1']);
  check('and the full VIN to fill in', p.links[0].vin, STEVEN_VIN);
  check('counted as linked', p.outcomes.linked, 1);
}
{
  // Many repair orders on one car is one decision, not one per order.
  const ros = [{ vehicleRef: 'VEH-STEVEN' }, { vehicleRef: 'veh-steven' }, { vehicleRef: ' VEH-STEVEN ' }];
  const p = plan(ros, facts([['VEH-STEVEN', { vin: STEVEN_VIN }]]), [STEVEN]);
  check('several repair orders on one car make one link', p.links.length, 1);
}
{
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: '5npeb4ac6fa124198' }]]), [{ id: 'x', vinLast8: 'fa124198' }]);
  check('VIN case does not matter', p.links.length, 1);
}

// --- refusals ----------------------------------------------------------------------
{
  const p = plan([{ vehicleRef: 'v1' }], facts([]), [STEVEN]);
  check('PBS gave no VIN: not linked', p.outcomes['no-vin'], 1);
  check('and nothing linked', p.links.length, 0);
}
{
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: 'ABC' }]]), [STEVEN]);
  check('a VIN too short to match on: not linked', p.outcomes['no-vin'], 1);
}
{
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: '5NPEB4AC6FA999999' }]]), [STEVEN]);
  check('nobody with those last 8: not linked', p.outcomes['no-customer'], 1);
}
{
  const linkedElsewhere = { id: 'a', vinLast8: 'FA124198', pbsVehicleId: 'SOME-OTHER-CAR' };
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: STEVEN_VIN }]]), [linkedElsewhere]);
  check('the only match is tied to a different PBS car: not moved', p.outcomes['already-linked-elsewhere'], 1);
  check('and no link is made', p.links.length, 0);
}
{
  const twins = [{ id: 'a', vinLast8: 'FA124198' }, { id: 'b', vinLast8: 'FA124198' }];
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: STEVEN_VIN }]]), twins);
  check('two unlinked customers share those last 8: ambiguous, not guessed', p.outcomes.ambiguous, 1);
  check('neither is linked', p.links.length, 0);
}
{
  // One linked to another car, one free: the free one is the answer.
  const pair = [{ id: 'a', vinLast8: 'FA124198', pbsVehicleId: 'OTHER' }, { id: 'b', vinLast8: 'FA124198' }];
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: STEVEN_VIN }]]), pair);
  check('a single unlinked match among linked ones is used', p.links.map((l) => l.customerId), ['b']);
}
{
  // Two different PBS vehicles both pointing at one customer.
  const p = plan(
    [{ vehicleRef: 'v1' }, { vehicleRef: 'v2' }],
    facts([['v1', { vin: STEVEN_VIN }], ['v2', { vin: '1HGCM82633FA124198' }]]),
    [STEVEN]
  );
  check('two PBS cars claiming one customer: neither linked', p.links.length, 0);
  check('both counted ambiguous', p.outcomes.ambiguous, 2);
}
{
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: STEVEN_VIN, make: 'TOYOTA' }]]), [STEVEN]);
  check('makes disagree: not linked', p.outcomes['make-mismatch'], 1);
}
{
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: STEVEN_VIN, make: 'HYUNDAI MOTOR' }]]), [STEVEN]);
  check('a longer spelling of the same make still matches', p.links.length, 1);
}
{
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: STEVEN_VIN }]]), [{ ...STEVEN, make: undefined }]);
  check('a make missing on either side is not a reason to refuse', p.links.length, 1);
}
{
  // A customer with a full VIN must match all 17, not just the tail.
  const full = { id: 'f', vinLast8: 'FA124198', vin: 'KMHXX00XXFA124198' };
  const p = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: STEVEN_VIN }]]), [full]);
  check('same last 8 but a different full VIN: not that customer', p.outcomes['no-customer'], 1);
  const p2 = plan([{ vehicleRef: 'v1' }], facts([['v1', { vin: 'KMHXX00XXFA124198' }]]), [full]);
  check('the matching full VIN is linked', p2.links.length, 1);
}

// --- the index keeps every customer per key ---------------------------------------
{
  const idx = indexCustomersByVinLast8([{ id: 'a', vinLast8: 'FA124198' }, { id: 'b', vinLast8: 'fa124198' }, { id: 'c', vinLast8: '' }, { id: 'd', vinLast8: '', vin: STEVEN_VIN }]);
  check('two customers with the same last 8 are both kept, not one overwriting the other', idx.get('FA124198').map((c) => c.id), ['a', 'b', 'd']);
  check('a customer with no VIN at all is left out', [...idx.values()].flat().some((c) => c.id === 'c'), false);
}

// --- the outcomes add up -----------------------------------------------------------
{
  const p = plan(
    [{ vehicleRef: 'a' }, { vehicleRef: 'b' }, { vehicleRef: 'c' }, { vehicleRef: 'd' }],
    facts([['a', { vin: STEVEN_VIN }], ['b', { vin: 'X' }], ['c', { vin: '5NPEB4AC6FA000000' }]]),
    [STEVEN]
  );
  const total = Object.values(p.outcomes).reduce((t, n) => t + n, 0);
  check('every vehicle gets exactly one outcome', total, 4);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
