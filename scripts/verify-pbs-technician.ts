/**
 * Verifies PBS technician efficiency aggregation.
 * Run: npx tsx scripts/verify-pbs-technician.ts
 */
import {
  aggregateFlaggedHoursByTech,
  aggregateTechnicianPerformance,
  pbsClockActivityHours,
} from '../server/pbs/pbsTechnicianAggregator.js';
import type { PbsEmployee, PbsTimeClockActivity } from '../server/pbs/pbsExtendedTypes.js';
import type { PbsRepairOrderFull } from '../server/pbs/pbsPerformanceTypes.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const activity: PbsTimeClockActivity = {
  IsTech: true,
  UserRef: 'tech-user-1',
  ClockedInUTCOffset: { DateTime: '2026-07-01T15:00:00Z', OffsetMinutes: -420 },
  ClockedOutUTCOffset: { DateTime: '2026-07-01T23:00:00Z', OffsetMinutes: -420 },
};

assert(Math.abs(pbsClockActivityHours(activity) - 8) < 0.01, 'clock activity spans 8 hours');

const employees: PbsEmployee[] = [
  {
    EmployeeId: 'tech-user-1',
    TechnicianNumber: '101',
    DisplayName: 'Alex Tech',
    Technician: true,
  },
];

const repairOrders: PbsRepairOrderFull[] = [
  {
    Status: 'Cashiered',
    Requests: [
      {
        Tech: '101',
        LabourLines: [{ Tech: '101', SoldHours: 6 }],
      },
    ],
  },
];

const flagged = aggregateFlaggedHoursByTech(repairOrders);
assert(flagged.get('101') === 6, 'sums flagged hours by tech number');

const result = aggregateTechnicianPerformance(
  [activity],
  employees,
  flagged,
  '2026-07-01',
  '2026-07-31'
);

assert(result.technicians.length === 1, 'produces one technician row');
assert(result.technicians[0].techName === 'Alex Tech', 'uses employee display name');
assert(result.technicians[0].clockedHours === 8, 'clocked hours match');
assert(result.technicians[0].flaggedHours === 6, 'flagged hours match');
assert(result.technicians[0].efficiency === 75, 'efficiency is 75%');

console.log('Verification PASSED — PBS technician aggregation');
