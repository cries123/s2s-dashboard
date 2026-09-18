/**
 * Tests for the top-moving-parts aggregator.
 * Run: npm run test:parts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-parts-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({ entryPoints: ['src/lib/topMovingParts.ts'], bundle: true, format: 'esm', outfile: entry, logLevel: 'error' });
const { computeTopMovingParts, movingPartsWindowForMonth } = await import(pathToFileURL(entry).href);

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); failed++; } else passed++;
}

const visit = (id, date, parts) => ({ id, soNumber: id, date, mileage: 0, advisor: 'A', requests: '', lines: [{ lineNumber: 1, partLines: parts }] });
const customers = [
  { id: 'c1', recentVisits: [
    visit('RO1', '2026-09-03', [{ partNumber: '26300-35505', description: 'OIL FILTER', qty: 1, price: 12 }, { partNumber: 'oil 5w30', qty: 5, price: 8 }]),
    visit('RO2', '2026-09-10', [{ partNumber: '26300-35505', description: 'OIL FILTER', qty: 1, price: 12 }]),
  ] },
  { id: 'c2', recentVisits: [
    visit('RO3', '2026-09-12', [{ partNumber: '26300-35505', qty: 2 }, { partNumber: '28113-L1000', description: 'CABIN FILTER', qty: 1, price: 30 }]),
    visit('RO4', '2026-08-30', [{ partNumber: '28113-L1000', qty: 9 }]),   // previous month — excluded
  ] },
];
const sept = { start: '2026-09-01', end: '2026-09-30' };

console.log('\nAggregation');
const top = computeTopMovingParts(customers, sept, 10);
check('ranks by units shipped', top.map(p => p.partNumber), ['OIL5W30', '26300-35505', '28113-L1000']);
check('sums quantity across visits and customers', top[1].quantity, 4);
check('counts distinct repair orders', top[1].repairOrders, 3);
check('sums revenue only where a price exists', top[1].revenue, 24);
check('keeps a description from any line that had one', top[1].description, 'OIL FILTER');
check('excludes visits outside the window', top[2].quantity, 1);
check('normalises part number spacing/case', top[0].partNumber, 'OIL5W30');
check('respects the limit', computeTopMovingParts(customers, sept, 1).length, 1);
check('empty history -> empty list', computeTopMovingParts([{ id: 'x', recentVisits: [] }], sept), []);

console.log('\nWindow for a view period');
check("'active' -> current calendar month", movingPartsWindowForMonth('active', new Date('2026-09-17T12:00:00')), { start: '2026-09-01', end: '2026-09-30' });
check('archive key -> that month, correct last day (Feb)', movingPartsWindowForMonth('2026-02'), { start: '2026-02-01', end: '2026-02-28' });

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
