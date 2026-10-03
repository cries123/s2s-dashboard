/**
 * Tests for the Fixed Operations Forecast model.
 *
 * The inputs below are the orange cells of the store's own workbook, and every
 * expected figure is what that workbook prints. If this file passes, the screen
 * and the spreadsheet agree to the cent; if someone changes a formula here, it
 * fails against the source of truth rather than against a number I made up.
 *
 * Run: npm run test:forecast
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 's2s-forecast-'));
const entry = join(outDir, 'bundle.mjs');
await esbuild.build({
  entryPoints: ['src/lib/fixedOpsForecastModel.ts'],
  bundle: true,
  format: 'esm',
  outfile: entry,
  logLevel: 'error',
});
const {
  computeFixedOpsForecast,
  emptyFixedOpsForecastInputs,
  mixPercentTotal,
  weekdayCountsForMonth,
  withWeekdayCounts,
  WEEKDAYS,
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
/** The workbook rounds for display; compare to the cent. */
function near(name, actual, expected, tolerance = 0.01) {
  const ok = Math.abs(actual - expected) <= tolerance;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    console.log(`        expected ${expected} ± ${tolerance}, got ${actual}`);
    failed++;
  } else passed++;
}

// ---------------------------------------------------------------------------
// The workbook's own August figures, read off the orange cells.
// ---------------------------------------------------------------------------
const capacity = {
  Monday: { daysInMonth: 4, techsAvailable: 7, hoursEach: 8 },
  Tuesday: { daysInMonth: 4, techsAvailable: 8, hoursEach: 8 },
  Wednesday: { daysInMonth: 4, techsAvailable: 8, hoursEach: 8 },
  Thursday: { daysInMonth: 5, techsAvailable: 8, hoursEach: 8 },
  Friday: { daysInMonth: 5, techsAvailable: 8, hoursEach: 8 },
  Saturday: { daysInMonth: 5, techsAvailable: 3, hoursEach: 7 },
  Sunday: { daysInMonth: 0, techsAvailable: 0, hoursEach: 0 },
};

const workbook = {
  workingDays: 27,
  serviceDays: 27,
  capacity,
  absenteeismPercent: 11,
  efficiencyPercent: 92,
  labor: [
    { key: 'custPay', label: 'Customer pay', mixPercent: 59, elr: 132.99, gpPercent: 80 },
    { key: 'warrPay', label: 'Warranty', mixPercent: 12, elr: 138.53, gpPercent: 78.6 },
    { key: 'internal', label: 'Internal', mixPercent: 18, elr: 139.02, gpPercent: 79.6 },
    { key: 'srvContract', label: 'Service contract', mixPercent: 11, elr: 105.1, gpPercent: 79.7 },
    { key: 'intAcc', label: 'Internal accessories', mixPercent: 0, elr: 0, gpPercent: 0 },
    { key: 'quickLube', label: 'Quick lube', mixPercent: 0, elr: 0, gpPercent: 0 },
  ],
  sublet: { sales: 1500, gpPercent: 20 },
  unappliedTime: 0,
  parts: [
    { key: 'cpParts', label: 'CP parts', laborKey: 'custPay', partsToLaborRatio: 0.85, gpPercent: 36 },
    { key: 'warrParts', label: 'Warranty parts', laborKey: 'warrPay', partsToLaborRatio: 1.24, gpPercent: 28 },
    { key: 'internalParts', label: 'Internal parts', laborKey: 'internal', partsToLaborRatio: 0.65, gpPercent: 27 },
    { key: 'srvContractParts', label: 'SC parts', laborKey: 'srvContract', partsToLaborRatio: 1.25, gpPercent: 28 },
    { key: 'intAccParts', label: 'Int acc parts', laborKey: 'intAcc', partsToLaborRatio: 0, gpPercent: 0 },
    { key: 'quickLubeParts', label: 'Quick lube parts', laborKey: 'quickLube', partsToLaborRatio: 0, gpPercent: 0 },
  ],
  partsDirect: [{ key: 'tires', label: 'Tires', sales: 0, gpPercent: 0 }],
  counter: [
    { key: 'counterRetail', label: 'Counter retail', sales: 9500, gpPercent: 39 },
    { key: 'wholesale', label: 'Wholesale', sales: 111500, gpPercent: 22 },
    { key: 'accCustomer', label: 'Accessory customer', sales: 0, gpPercent: 0 },
    { key: 'accWarranty', label: 'Accessory warranty', sales: 0, gpPercent: 0 },
    { key: 'accInternal', label: 'Accessory internal', sales: 0, gpPercent: 0 },
    { key: 'accCounterRetail', label: 'Accessory counter retail', sales: 0, gpPercent: 0 },
    { key: 'accWholesale', label: 'Accessory wholesale', sales: 0, gpPercent: 0 },
    { key: 'gasOilGrease', label: 'Gas, oil and grease', sales: 0, gpPercent: 0 },
  ],
};

const r = computeFixedOpsForecast(workbook);

// --- capacity, row 8 of the workbook ---------------------------------------
near('Monday hours available (C8)', r.hoursAvailableByWeekday.Monday, 224, 0);
near('Tuesday (D8)', r.hoursAvailableByWeekday.Tuesday, 256, 0);
near('Thursday (F8)', r.hoursAvailableByWeekday.Thursday, 320, 0);
near('Saturday, on seven-hour days (H8)', r.hoursAvailableByWeekday.Saturday, 105, 0);
near('Sunday, closed (I8)', r.hoursAvailableByWeekday.Sunday, 0, 0);
near('total monthly hours available (D10)', r.totalMonthlyHoursAvailable, 1481, 0);

// --- absenteeism and efficiency, rows 11-15 --------------------------------
near('lost hours (D12)', r.lostHours, 162.91);
near('total projected hours (D13)', r.totalProjectedHours, 1318.09);
near('total net projected hours (D15)', r.totalNetProjectedHours, 1212.6428);

// --- labor, rows 18-21 ------------------------------------------------------
near('customer pay hours (D18)', r.laborLines[0].hours, 715.459252);
near('customer pay labor sales (F18)', r.laborLines[0].sales, 95148.93);
near('customer pay gross (H18)', r.laborLines[0].gross, 76119.14);
near('warranty hours (D19)', r.laborLines[1].hours, 145.517136);
near('warranty labor sales (F19)', r.laborLines[1].sales, 20158.49);
near('warranty gross (H19)', r.laborLines[1].gross, 15844.57);
near('internal labor sales (F20)', r.laborLines[2].sales, 30344.69);
near('internal gross (H20)', r.laborLines[2].gross, 24154.37);
near('service contract labor sales (F21)', r.laborLines[3].sales, 14019.36);
near('service contract gross (H21)', r.laborLines[3].gross, 11173.43);
near('an unused pay type contributes nothing (F22)', r.laborLines[4].sales, 0, 0);

// --- labor totals, rows 25-29 ----------------------------------------------
near('every net hour is sold (D25)', r.totalLaborHours, 1212.6428);
near('total labor sales (F25)', r.totalLaborSales, 159671.47);
near('total labor gross (H25)', r.totalLaborGross, 127291.52);
near('blended GP % (G25)', r.laborGpPercent, 79.7209, 0.001);
near('total ELR (A29)', r.totalElr, 131.6723, 0.001);

// --- sublet and the service total, rows 27-32 ------------------------------
near('sublet gross (H27)', r.sublet.gross, 300, 0);
near('total service sales (F30)', r.totalServiceSales, 161171.47);
near('total service gross (H30)', r.totalServiceGross, 127591.52);
near('service GP % (G30)', r.serviceGpPercent, 79.1651, 0.001);
near('adjusted total, nothing unapplied (H32)', r.adjustedServiceGross, 127591.52);

// --- parts off labor, rows 35-38 -------------------------------------------
near('CP parts sale at 0.85 of CP labor (F35)', r.partsLines[0].sales, 80876.59);
near('CP parts gross (H35)', r.partsLines[0].gross, 29115.57);
near('warranty parts outsell warranty labor at 1.24 (F36)', r.partsLines[1].sales, 24996.53);
near('warranty parts gross (H36)', r.partsLines[1].gross, 6999.03);
near('internal parts (F37)', r.partsLines[2].sales, 19724.05);
near('service contract parts (F38)', r.partsLines[3].sales, 17524.2);
near('parts shop sales (F43)', r.partsShopSales, 143121.36);
near('parts shop gross (H43)', r.partsShopGross, 46346.87);

// --- counter and the parts total, rows 45-54 -------------------------------
near('counter retail gross (H45)', r.counterLines[0].gross, 3705, 0);
near('wholesale gross (H46)', r.counterLines[1].gross, 24530, 0);
near('total parts sales (F54)', r.totalPartsSales, 264121.36);
near('total parts gross (H54)', r.totalPartsGross, 74581.87);
near('parts GP % (G54)', r.partsGpPercent, 28.2377, 0.001);

// --- the bottom line, row 56 ----------------------------------------------
near('fixed operations sales (F56)', r.fixedOpsSales, 425292.83);
near('fixed operations gross (H56)', r.fixedOpsGross, 202173.39);
near('fixed operations GP % (G56)', r.fixedOpsGpPercent, 47.5375, 0.001);

// ---------------------------------------------------------------------------
// Behaviour the workbook does not check for.
// ---------------------------------------------------------------------------
check('a mix that adds up says so', mixPercentTotal(workbook.labor), 100);
check(
  'a mix that is short says so, rather than quietly forecasting light',
  mixPercentTotal([{ mixPercent: 50 }, { mixPercent: 47 }]),
  97
);

{
  const blank = emptyFixedOpsForecastInputs();
  const e = computeFixedOpsForecast(blank);
  check('an empty workbook forecasts nothing rather than NaN', [e.fixedOpsSales, e.fixedOpsGross], [0, 0]);
  check('and no percentage divides by zero', [e.laborGpPercent, e.totalElr, e.partsGpPercent], [0, 0, 0]);
  check('it still has every workbook row', [blank.labor.length, blank.parts.length, blank.counter.length], [6, 6, 8]);
}

{
  // Garbage in a text box must not poison the whole forecast.
  const dirty = {
    ...workbook,
    labor: [{ key: 'custPay', label: 'CP', mixPercent: '', elr: 'abc', gpPercent: null }],
    parts: [],
    partsDirect: [],
    counter: [],
  };
  const d = computeFixedOpsForecast(dirty);
  check('an empty or non-numeric box reads as zero', [d.totalLaborSales, d.totalLaborGross], [0, 0]);
  near('and the hours above it still compute', d.totalNetProjectedHours, 1212.6428);
}

{
  // Unapplied time comes off the gross, not the sales.
  const u = computeFixedOpsForecast({ ...workbook, unappliedTime: 5000 });
  near('unapplied time reduces the gross', u.adjustedServiceGross, 122591.52);
  near('and leaves sales alone', u.totalServiceSales, 161171.47);
}

// --- carrying the forecast into next month --------------------------------
check(
  'August 2026 weekday counts',
  weekdayCountsForMonth('2026-08'),
  { Monday: 5, Tuesday: 4, Wednesday: 4, Thursday: 4, Friday: 4, Saturday: 5, Sunday: 5 }
);
check(
  'February 2024 was a leap month',
  Object.values(weekdayCountsForMonth('2024-02')).reduce((a, b) => a + b, 0),
  29
);
check(
  'every month adds up to its own length',
  ['2026-01', '2026-02', '2026-04', '2026-09', '2026-12'].map((m) =>
    Object.values(weekdayCountsForMonth(m)).reduce((a, b) => a + b, 0)
  ),
  [31, 28, 30, 30, 31]
);
check('a bad month key gives no days rather than throwing', Object.values(weekdayCountsForMonth('oops')).reduce((a, b) => a + b, 0), 0);

{
  const next = withWeekdayCounts(workbook, weekdayCountsForMonth('2026-11'));
  check('the rates carry forward untouched', next.labor[0].elr, 132.99);
  check('the crew carries forward untouched', next.capacity.Monday.techsAvailable, 7);
  check('only the weekday counts change', next.capacity.Monday.daysInMonth, weekdayCountsForMonth('2026-11').Monday);
  check(
    'working days excludes the day nobody is rostered',
    next.workingDays,
    WEEKDAYS.filter((d) => workbook.capacity[d].techsAvailable > 0).reduce(
      (sum, d) => sum + weekdayCountsForMonth('2026-11')[d],
      0
    )
  );
  const forecast = computeFixedOpsForecast(next);
  check('and next month forecasts a real number', forecast.fixedOpsSales > 0, true);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
