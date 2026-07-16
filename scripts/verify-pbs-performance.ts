/**
 * Verifies PBS advisor performance aggregation from repair orders + parts invoices,
 * including advisor login-code alias resolution.
 * Run: npx tsx scripts/verify-pbs-performance.ts
 */
import {
  aggregatePbsAdvisorPerformance,
  collectRepairOrderCsrStrings,
  sumRepairOrderShopLabor,
} from '../server/pbs/pbsPerformanceAggregator.js';
import { buildPbsAdvisorAliases, cleanPbsCsrName, resolvePbsAdvisorCsr } from '../server/pbs/pbsAdvisorName.js';
import type { PbsPartsInvoiceFull, PbsRepairOrderFull } from '../server/pbs/pbsPerformanceTypes.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const repairOrders: PbsRepairOrderFull[] = [
  {
    RawRepairOrderNumber: '1001',
    DateCashiered: '2026-07-05T18:00:00.0000000-07:00',
    Status: 'Cashiered',
    CSR: 'Frank',
    Requests: [
      {
        CSR: 'Frank',
        LabourLines: [{ Price: 500, Cost: 200, SoldHours: 2 }],
        PartLines: [{ ExtendedPrice: 150, Cost: 90, Shipped: 1 }],
      },
    ],
  },
  {
    RawRepairOrderNumber: '1002',
    DateCashiered: '2026-07-06T18:00:00.0000000-07:00',
    Status: 'Cashiered',
    CSR: 'Lemmy',
    CustomerSummary: { Labour: 300, Parts: 100 },
  },
  {
    RawRepairOrderNumber: '1003',
    DateCashiered: '2026-07-08T18:00:00.0000000-07:00',
    Status: 'Cashiered',
    CSR: 'Jaryn',
    Requests: [
      {
        CSR: 'Jaryn',
        LabourLines: [{ Price: 400, Cost: 100, SoldHours: 1.5 }],
        PartLines: [{ ExtendedPrice: 50, Cost: 20, Shipped: 1 }],
      },
    ],
    WarrantySummary: { Labour: 200, Parts: 75 },
  },
  {
    RawRepairOrderNumber: '1004',
    DateCashiered: '2026-07-10T18:00:00.0000000-07:00',
    Status: 'Cashiered',
    CSR: 'Frank',
    Requests: [
      {
        CSR: 'Frank',
        LabourLines: [{ Price: 1000, Cost: 200, SoldHours: 4 }],
        PartLines: [{ ExtendedPrice: 500, Cost: 200, Shipped: 1 }],
      },
    ],
    CustomerSummary: { Labour: 1000, Parts: 500 },
    WarrantySummary: { Parts: 500 },
  },
];

const partsInvoices: PbsPartsInvoiceFull[] = [
  {
    RawPartsInvoiceNumber: 'PI-55',
    DateCashiered: '2026-07-07T15:00:00.0000000-07:00',
    Status: 'Cashiered',
    PartLines: [{ CSR: 'Frank', ExtendedPrice: 80, Cost: 40, Shipped: 1 }],
  },
];

const result = aggregatePbsAdvisorPerformance(
  repairOrders,
  partsInvoices,
  '2026-07-01',
  '2026-07-31'
);

assert(result.advisors.length >= 2, 'aggregates multiple advisors');
const frank = result.advisors.find((row) => row.name === 'Frank');
const lemmy = result.advisors.find((row) => row.name === 'Lemmy');
assert(Boolean(frank), 'includes Frank');
assert(Boolean(lemmy), 'includes Lemmy');
assert((frank?.grossLabor || 0) > 0, 'Frank has labor gross');
assert((frank?.grossParts || 0) > 0, 'Frank has parts gross from RO + counter invoice');
const jaryn = result.advisors.find((row) => row.name === 'Jaryn');
assert(Boolean(jaryn), 'includes Jaryn');
assert((jaryn?.laborSold || 0) >= 600, 'Jaryn includes request labor plus warranty summary delta');
assert((jaryn?.partsSold || 0) >= 125, 'Jaryn includes request parts plus warranty summary delta');

const shopLabor = sumRepairOrderShopLabor(repairOrders[2]);
assert(shopLabor.laborSold >= 600, 'shop labor sold includes warranty summary on attributed ROs');
assert(shopLabor.laborGross >= 450, 'shop labor gross includes warranty summary on attributed ROs');

assert(result.totals.totalGross > 0, 'totals include labor gross');
assert(result.totals.totalGross >= shopLabor.laborGross, 'shop totals use all cashiered RO labor');
assert(result.totals.totalGrossParts > 0, 'totals include parts gross');

const frankAfterDup = result.advisors.find((row) => row.name === 'Frank');
assert((frankAfterDup?.partsSold || 0) < 900, 'does not double-count echoed warranty parts on RO 1004');
assert((frankAfterDup?.grossParts || 0) < 700, 'parts gross stays single-counted when PBS echoes summaries');

// --- Advisor login-code alias resolution ---
const aliases = buildPbsAdvisorAliases(['LEMMY LV4278', 'SARAH SB123']);
assert(aliases.get('lv4278') === 'Lemmy', 'maps LV4278 to Lemmy from combined string');
assert(aliases.get('sb123') === 'Sarah', 'maps generic code to title-cased name');
assert(cleanPbsCsrName('LV4278', aliases) === 'Lemmy', 'pure code resolves via alias');
assert(cleanPbsCsrName('SARAH SB123') === 'Sarah', 'mixed name+code keeps the name');
assert(cleanPbsCsrName('XY999') === 'XY999', 'unknown code stays as consistent bucket key');
assert(
  resolvePbsAdvisorCsr('01', 'LV4278', aliases) === 'Lemmy',
  'junk line CSR falls back to header PBS code alias'
);

const codeRepairOrders: PbsRepairOrderFull[] = [
  {
    RawRepairOrderNumber: '2001',
    DateCashiered: '2026-07-09T18:00:00.0000000-07:00',
    Status: 'Cashiered',
    CSR: 'LV4278',
    Requests: [
      {
        CSR: 'LV4278',
        LabourLines: [{ Price: 250, Cost: 100, SoldHours: 1 }],
      },
    ],
  },
];

const csrStrings = collectRepairOrderCsrStrings(codeRepairOrders);
assert(csrStrings.includes('LV4278'), 'collects CSR strings from RO requests');

const codeResult = aggregatePbsAdvisorPerformance(
  codeRepairOrders,
  [],
  '2026-07-01',
  '2026-07-31',
  aliases
);
const lemmyFromCode = codeResult.advisors.find((row) => row.name === 'Lemmy');
assert(Boolean(lemmyFromCode), 'labor from a code-only CSR buckets under the resolved advisor');
assert((lemmyFromCode?.grossLabor || 0) === 150, 'code-attributed labor gross is correct');

console.log('Verification PASSED — PBS advisor performance aggregation');
console.log(
  JSON.stringify(
    {
      advisors: result.advisors.map((row) => ({
        name: row.name,
        soCount: row.soCount,
        grossLabor: row.grossLabor,
        grossParts: row.grossParts,
      })),
      totals: result.totals,
    },
    null,
    2
  )
);
