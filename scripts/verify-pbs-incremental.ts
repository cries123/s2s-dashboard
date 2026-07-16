/**
 * Verifies PBS incremental sync watermark and filtering helpers.
 * Run: npx tsx scripts/verify-pbs-incremental.ts
 */
import {
  dedupeRepairOrders,
  repairOrderChangedSince,
  resolveIncrementalWatermark,
  shouldLogRepairOrderVisit,
  toPbsPacificCriteriaIso,
} from '../server/pbs/pbsIncrementalCriteria.js';
import type { PbsRepairOrder, PbsSyncState } from '../server/pbs/pbsTypes.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const prior: PbsSyncState = {
  lastSyncAt: '2026-07-09T17:22:17.000Z',
  lastSuccessfulSyncAt: '2026-07-09T17:22:17.000Z',
  lastSyncOk: true,
};

assert(resolveIncrementalWatermark(prior, false) !== undefined, 'uses last successful sync for pull changes');
assert(resolveIncrementalWatermark(prior, true) === undefined, 'full refresh clears watermark');

const failedPrior: PbsSyncState = {
  lastSyncAt: '2026-07-10T12:00:00.000Z',
  lastSuccessfulSyncAt: '2026-07-09T17:22:17.000Z',
  lastSyncOk: false,
};
assert(
  resolveIncrementalWatermark(failedPrior, false) !== undefined,
  'failed sync still uses last successful watermark'
);

const pacific = toPbsPacificCriteriaIso('2026-07-09T17:22:17.000Z');
assert(pacific.includes('T'), 'formats PBS pacific criteria timestamp');
assert(/[+-]\d{2}:\d{2}$/.test(pacific), 'includes pacific offset');

const roNew: PbsRepairOrder = {
  RawRepairOrderNumber: '118001',
  DateCashiered: '2026-07-10T18:00:00.0000000-07:00',
  VehicleRef: 'veh-1',
};
const roOld: PbsRepairOrder = {
  RawRepairOrderNumber: '117001',
  DateCashiered: '2026-06-01T18:00:00.0000000-07:00',
  VehicleRef: 'veh-1',
};

assert(
  shouldLogRepairOrderVisit(roNew, '2026-07-09T17:22:17.000Z'),
  'logs cashiered visit after watermark'
);
assert(
  !shouldLogRepairOrderVisit(roOld, '2026-07-09T17:22:17.000Z'),
  'skips old cashiered visit on incremental pull'
);
assert(
  repairOrderChangedSince(
    { ...roNew, LastUpdate: '2026-07-10T19:00:00.0000000-07:00' },
    '2026-07-09T17:22:17.000Z'
  ),
  'detects RO activity after watermark'
);

const deduped = dedupeRepairOrders([
  { RepairOrderId: 'a', RawRepairOrderNumber: '100' },
  { RepairOrderId: 'a', RawRepairOrderNumber: '100', Status: 'Cashiered' },
]);
assert(deduped.length === 1, 'dedupes repair orders by key');

const { buildRoHistoryWindows } = await import('../server/pbs/pbsSync.js');
const windows = buildRoHistoryWindows(new Date('2026-07-16T12:00:00Z'));
assert(windows.length === 6, 'splits 3-year history into 6 windows');
assert(
  windows.every((w: { sinceIso: string; untilIso: string }) => w.sinceIso < w.untilIso),
  'each window has valid bounds'
);
const newest = windows[0];
const oldest = windows[windows.length - 1];
assert(newest.untilIso > oldest.untilIso, 'windows ordered newest first');

console.log('Verification PASSED — PBS incremental sync criteria');
