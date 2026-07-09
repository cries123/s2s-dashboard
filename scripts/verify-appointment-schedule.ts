/**
 * Verifies PBS appointment → day schedule slot mapping.
 * Run: npx tsx scripts/verify-appointment-schedule.ts
 */
import {
  buildAppointmentCustomerLookup,
  mapPbsAppointmentToSlot,
} from '../server/pbs/pbsAppointmentSchedule.js';
import { parsePbsIso, pbsIsoToPacificMinutes } from '../server/pbs/pbsMappers.js';
import type { PbsAppointment } from '../server/pbs/pbsTypes.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const lookup = buildAppointmentCustomerLookup({
  byVehicleRef: new Map([['veh-1', 'cust-1']]),
  byContactRef: new Map(),
  dataById: new Map([
    [
      'cust-1',
      {
        firstName: 'Crystal',
        lastName: 'Ramos',
        year: '2024',
        make: 'HYUNDAI',
        model: 'TUCSON HYBRID',
      },
    ],
  ]),
});

const sample: PbsAppointment = {
  AppointmentId: 'appt-95741',
  RawAppointmentNumber: '95741',
  AppointmentTime: '2026-07-09T14:00:00.0000000-07:00',
  PickupTime: '2026-07-09T17:00:00.0000000-07:00',
  Status: 'Open',
  VehicleRef: 'veh-1',
  Advisor: 'LEMMY LV4278',
  IsWaiter: true,
  RequestLines: [
    {
      Tech: '70',
      CSR: 'LEMMY LV4278',
      RequestDescription: 'FB - FRONT BRAKE PAD AND ROTOR',
      AllowedHours: 1.5,
    },
  ],
};

const slot = mapPbsAppointmentToSlot(sample, lookup);
assert(Boolean(slot), 'maps appointment to schedule slot');
assert(slot!.techNumber === '70', 'captures technician number');
assert(slot!.customerName === 'RAMOS, CRYSTAL', 'formats customer name');
assert(slot!.vehicleLabel.includes('TUCSON'), 'includes vehicle label');
assert(slot!.startMinutes === 14 * 60, 'uses Pacific appointment time');
assert(slot!.durationMinutes === 90, 'uses allowed hours for block height');
assert(slot!.isWaiter === true, 'preserves waiter flag');

const parsed = parsePbsIso('2026-07-09T14:00:00.0000000-07:00');
assert(Boolean(parsed), 'parses PBS 7-digit fractional ISO');
assert(pbsIsoToPacificMinutes('2026-07-09T14:00:00.0000000-07:00') === 14 * 60, 'Pacific minutes from PBS ISO');

console.log('Verification PASSED — appointment schedule mapping');
console.log(JSON.stringify(slot, null, 2));
