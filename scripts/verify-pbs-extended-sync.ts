/**
 * Verifies PBS dispatch mapper and reminder helpers.
 * Run: npx tsx scripts/verify-pbs-extended-sync.ts
 */
import { mapPbsOpenRepairOrderToDispatch, mapPbsDispatchStatus, mapPbsDepartment } from '../server/pbs/pbsDispatchMapper.js';
import {
  isActivePbsWorkplanReminder,
  isInventoryPbsVehicle,
  isOpenPbsRepairOrder,
  mapPbsReminderDueDate,
} from '../server/pbs/pbsTechnicianAggregator.js';
import type { PbsCustomerIndexMaps, PbsOpenRepairOrder } from '../server/pbs/pbsExtendedTypes.js';

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

const index: PbsCustomerIndexMaps = {
  byContactRef: new Map([['contact-1', 'cust-1']]),
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
