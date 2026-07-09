/**
 * Verifies PBS advisor performance aggregation from repair orders + parts invoices.
 * Run: npx tsx scripts/verify-pbs-performance.ts
 */
import { aggregatePbsAdvisorPerformance } from '../server/pbs/pbsPerformanceAggregator.js';
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
assert(result.totals.totalGross > 0, 'totals include labor gross');
assert(result.totals.totalGrossParts > 0, 'totals include parts gross');

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
