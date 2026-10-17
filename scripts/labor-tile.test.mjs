/**
 * Hours sold and ELR on the Operations labor tile.
 *
 * Figures are October 2026's, as the live page showed them on Oct 15:
 * $27,167 labor gross, 219 hours, $33,090 labor sales.
 *
 * Run: npm run test:labortile
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-labortile-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['src/lib/appointmentForecast.ts'],
  bundle: true,
  format: 'esm',
  outfile: entry,
  logLevel: 'error',
});
const { calculateAppointmentForecast } = await import(pathToFileURL(entry).href);

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

const base = {
  stats: [{ date: '2026-10-15', count: 21 }],
  dailyTarget: 20,
  laborTarget: 85000,
  partsTarget: 25000,
  mtdGross: 27167,
  mtdLaborSales: 33090.41,
  mtdPartsGross: 8485,
  performanceReportEndDate: '2026-10-15',
  referenceDate: new Date(2026, 9, 15, 12),
};

const oct = calculateAppointmentForecast({ ...base, mtdHoursSold: 219 });
check('labor gross still trends to $54,334, as on the live page', oct.grossForecast, 54334);
check('hours sold carried through', oct.mtdHoursSold, 219);
check('ELR is labor sales per hour sold', Math.round(oct.effectiveLaborRate), 151);

const none = calculateAppointmentForecast({ ...base, mtdHoursSold: 0 });
check('no hours: no ELR rather than a divide-by-zero', none.effectiveLaborRate, 0);

const old = calculateAppointmentForecast(base);
check('callers that pass no hours still work', old.mtdHoursSold, 0);

const sep = calculateAppointmentForecast({
  ...base,
  stats: [{ date: '2026-09-30', count: 18 }],
  mtdGross: 64201,
  mtdLaborSales: 78667.2,
  mtdHoursSold: 521.2,
  performanceReportEndDate: '2026-09-30',
  referenceDate: new Date(2026, 8, 30, 12),
});
check("September's ELR", Math.round(sep.effectiveLaborRate), 151);

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
