/**
 * Verifies PBS dispatch mapper and reminder helpers.
 * Run: npx tsx scripts/verify-pbs-extended-sync.ts
 */
import { mapPbsOpenRepairOrderToDispatch, mapPbsDispatchStatus, mapPbsDepartment } from '../server/pbs/pbsDispatchMapper.js';
import {
  mapRepairOrderToVisit,
  mapRepairOrderRequestLines,
  mergeVehiclePbsServiceVisits,
} from '../server/pbs/pbsMappers.js';
import {
  isActivePbsWorkplanReminder,
  isInventoryPbsVehicle,
  isOpenPbsRepairOrder,
  mapPbsReminderDueDate,
} from '../server/pbs/pbsTechnicianAggregator.js';
import type { PbsCustomerIndexMaps, PbsOpenRepairOrder } from '../server/pbs/pbsExtendedTypes.js';
import { normalizePbsRef } from '../server/pbs/pbsAppointmentSchedule.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(mapPbsDispatchStatus('Waiting for Authorization') === 'WFA', 'maps WFA status');
assert(mapPbsDispatchStatus('Parts on Order') === 'POO', 'maps POO status');
assert(mapPbsDepartment('Quick Service', 'Main') === 'quick_service', 'maps quick service lane');

assert(isOpenPbsRepairOrder({ RawRepairOrderNumber: '500', Status: 'Open' }), 'open RO without cashier date');
assert(!isOpenPbsRepairOrder({ RawRepairOrderNumber: '500', DateCashiered: '2026-07-01T00:00:00' }), 'cashiered RO is not open');

assert(
  isActivePbsWorkplanReminder({ Status: 'Active', CompletedDate: '0001-01-01T00:00:00' }),
  'active reminder'
);
assert(
  !isActivePbsWorkplanReminder({ Status: 'Completed', CompletedDate: '2026-07-01T00:00:00' }),
  'completed reminder skipped'
);

assert(mapPbsReminderDueDate('2026-08-15T00:00:00.0000000-07:00') === '2026-08-15', 'maps reminder due date');

assert(isInventoryPbsVehicle({ Status: 'In Stock', Inventory: 1 }), 'inventory vehicle by status');
assert(!isInventoryPbsVehicle({ Status: 'Sold', IsInactive: false }), 'sold vehicle excluded');

const pdiVisit = mapRepairOrderToVisit({
  RawRepairOrderNumber: '117828',
  DateCashiered: '2026-06-29T18:00:00.0000000-07:00',
  MileageOut: 8,
  Requests: [{ RequestDescription: 'PERFORM MANUFACTURER PRE-DELIVERY INSPECTION.' }],
});
assert(pdiVisit?.mileage === 8, 'keeps PDI visits for the matched vehicle');

const retailVisit = mapRepairOrderToVisit({
  RawRepairOrderNumber: '117778',
  DateCashiered: '2026-06-29T18:00:00.0000000-07:00',
  MileageOut: 24464,
  Requests: [{ RequestDescription: 'PERFORM OIL/FILTER CHANGE' }],
});
assert(retailVisit?.mileage === 24464, 'keeps retail visit mileage');

const detailedLines = mapRepairOrderRequestLines({
  RawRepairOrderNumber: '117892',
  Requests: [
    {
      RequestCode: 'OIL',
      RequestDescription: 'Customer requests oil change',
      Cause: 'Maintenance due',
      Correction: 'Replaced engine oil and filter',
      Tech: '070',
      LabourLines: [{ OpCode: 'LOF', OpDescription: 'Lube oil filter', SoldHours: 0.5, Price: 89.95 }],
      PartLines: [{ PartNumber: '263502', PartDescription: 'Oil filter', Shipped: 1, ExtendedPrice: 12.5 }],
    },
  ],
});
assert(detailedLines.length === 1, 'maps request lines');
assert(detailedLines[0].concern === 'Customer requests oil change', 'maps concern');
assert(detailedLines[0].cause === 'Maintenance due', 'maps cause');
assert(detailedLines[0].correction === 'Replaced engine oil and filter', 'maps correction');
assert(detailedLines[0].labourLines.length === 1, 'maps labour lines');
assert(detailedLines[0].partLines.length === 1, 'maps part lines');

const merged = mergeVehiclePbsServiceVisits(
  [
    { id: 'pbs-999', soNumber: '999', mileage: 34, date: '2026-06-28', requests: 'Wrong vehicle recall' },
    { id: 'manual-1', soNumber: 'M1', mileage: 12000, date: '2026-05-01', requests: 'Manual entry' },
  ],
  [
    { id: 'pbs-117828', soNumber: '117828', mileage: 8, date: '2026-06-29', requests: 'PERFORM MANUFACTURER PRE-DELIVERY INSPECTION.', pbsVehicleRef: 'veh-1' },
    { id: 'pbs-117778', soNumber: '117778', mileage: 24464, date: '2026-06-29', requests: 'PERFORM OIL/FILTER CHANGE', pbsVehicleRef: 'veh-1' },
  ],
  'veh-1'
);
assert(merged.some((visit) => visit.soNumber === 'M1'), 'preserves manual visits');
assert(!merged.some((visit) => visit.soNumber === '999'), 'drops stale PBS visits from other vehicles');
assert(merged.some((visit) => visit.soNumber === '117828'), 'keeps PDI PBS visits for this vehicle');
assert(merged.some((visit) => visit.soNumber === '117778'), 'keeps retail PBS visits');

const legacyMerged = mergeVehiclePbsServiceVisits(
  [{ id: 'pbs-old', soNumber: 'OLD', mileage: 500, date: '2026-01-01', requests: 'Legacy visit' }],
  [],
  'veh-1'
);
assert(legacyMerged.some((visit) => visit.soNumber === 'OLD'), 'keeps legacy PBS visits until this vehicle is refreshed');

const wrongVehicle = mergeVehiclePbsServiceVisits(
  [{ id: 'pbs-bad', soNumber: 'BAD', mileage: 12, date: '2026-06-01', requests: 'Other car', pbsVehicleRef: 'veh-2' }],
  [{ id: 'pbs-117828', soNumber: '117828', mileage: 8, date: '2026-06-29', requests: 'PDI', pbsVehicleRef: 'veh-1' }],
  'veh-1'
);
assert(!wrongVehicle.some((visit) => visit.soNumber === 'BAD'), 'drops PBS visits tagged to another vehicle');

const index: PbsCustomerIndexMaps = {
  byContactRef: new Map([[normalizePbsRef('contact-1'), 'cust-1']]),
  byVehicleRef: new Map(),
  dataById: new Map([
    [
      'cust-1',
      {
        firstName: 'Jane',
        lastName: 'Driver',
        phone: '8055551212',
        vin: 'KM8J3CA24JU123456',
        vinLast8: 'U123456',
        year: '2024',
        model: 'Tucson',
        dealershipId: 'hyundai',
      },
    ],
  ]),
};

const ro: PbsOpenRepairOrder = {
  RepairOrderId: 'ro-guid-1',
  RawRepairOrderNumber: '7788',
  DateOpened: '2026-07-08T08:00:00.0000000-07:00',
  Status: 'Open',
  ContactRef: 'contact-1',
  Tag: '445',
  Shop: 'Quick Service',
  Requests: [{ RequestDescription: 'Oil change', Tech: '202', Skill: 'Quick Service' }],
  Transportation: 'Waiting',
};

const mapped = mapPbsOpenRepairOrderToDispatch(ro, 'hyundai', '2026-07-08T12:00:00.000Z', index);
assert(Boolean(mapped), 'maps open RO to dispatch payload');
assert(mapped?.roNumber === '7788', 'RO number mapped');
assert(mapped?.techNumber === '202', 'tech number mapped');
assert(mapped?.customerId === 'cust-1', 'links CRM customer');
assert(mapped?.department === 'quick_service', 'maps department from skill');
assert(mapped?.isWaiting === true, 'waiting customer flagged');
assert(mapped?.source === 'pbs-sync', 'tags PBS source');

console.log('Verification PASSED — PBS extended sync mappers');
