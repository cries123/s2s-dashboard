/**
 * Verifies PBS appointment → day schedule slot mapping.
 * Run: npx tsx scripts/verify-appointment-schedule.ts
 */
import {
  buildAppointmentCustomerLookup,
  buildAppointmentDisplayInfoMap,
  mapPbsAppointmentToSlot,
  normalizePbsRef,
} from '../server/pbs/pbsAppointmentSchedule.js';
import {
  parsePbsIso,
  pbsAppointmentToPacificMinutes,
  pbsIsoToPacificMinutes,
} from '../server/pbs/pbsMappers.js';
import type { PbsAppointment } from '../server/pbs/pbsTypes.js';

import { categorizeAppointmentBlock } from '../server/dms/parsers/appointments.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const lookup = buildAppointmentCustomerLookup({
  byVehicleRef: new Map([[normalizePbsRef('veh-1'), 'cust-1']]),
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

const wallClock: PbsAppointment = {
  AppointmentId: 'appt-wall',
  AppointmentTime: '2026-07-09T09:45:00.0000000Z',
  AppointmentTimeUTC: '2026-07-09T16:45:00.0000000Z',
  Status: 'Open',
  RequestLines: [{ RequestDescription: 'OIL CHANGE' }],
};

assert(
  pbsAppointmentToPacificMinutes(wallClock.AppointmentTime, wallClock.AppointmentTimeUTC) ===
    9 * 60 + 45,
  'prefers true UTC when available'
);

const localZ: PbsAppointment = {
  AppointmentId: 'appt-local-z',
  AppointmentTime: '2026-07-09T11:00:00.0000000Z',
  Status: 'Open',
  RequestLines: [{ RequestDescription: 'OIL CHANGE' }],
};

assert(
  pbsAppointmentToPacificMinutes(localZ.AppointmentTime, localZ.AppointmentTimeUTC) === 11 * 60,
  'treats AppointmentTime Z suffix as Pacific wall clock when UTC missing'
);

// PBS sometimes echoes wall-clock time into AppointmentTimeUTC with a Z suffix.
const echoedUtc: PbsAppointment = {
  AppointmentId: 'appt-echo',
  AppointmentTime: '2026-07-16T09:00:00.0000000Z',
  AppointmentTimeUTC: '2026-07-16T09:00:00.0000000Z',
  Status: 'Open',
  RequestLines: [{ RequestDescription: 'TIRE ROTATION' }],
};

assert(
  pbsAppointmentToPacificMinutes(echoedUtc.AppointmentTime, echoedUtc.AppointmentTimeUTC) === 9 * 60,
  'does not shift wall-clock time echoed into AppointmentTimeUTC (9 AM stays 9 AM, not 2 AM)'
);

const unresolvedAppt: PbsAppointment = {
  AppointmentId: 'appt-unknown',
  RawAppointmentNumber: '95999',
  AppointmentTime: '2026-07-09T10:00:00.0000000Z',
  Status: 'Open',
  ContactRef: 'contact-nowhere',
  RequestLines: [{ RequestDescription: 'DIAG' }],
};

const unresolvedSlot = mapPbsAppointmentToSlot(unresolvedAppt, lookup);
assert(
  unresolvedSlot!.customerName === 'APPT #95999',
  'unresolved appointments show appointment number instead of CUSTOMER'
);

const displayInfo = buildAppointmentDisplayInfoMap([
  {
    AppointmentId: 'appt-inline',
    ContactFirstName: 'Ricardo',
    ContactLastName: 'Jimenez',
    VehicleYear: '2023',
    VehicleMake: 'HYUNDAI',
    VehicleModel: 'SANTA FE PHEV',
  },
]);

const inlineAppt: PbsAppointment = {
  AppointmentId: 'appt-inline',
  AppointmentTime: '2026-07-09T06:00:00.0000000Z',
  Status: 'Open',
  RequestLines: [{ RequestDescription: 'OIL CHANGE' }],
};

const inlineSlot = mapPbsAppointmentToSlot(inlineAppt, lookup, displayInfo);
assert(inlineSlot!.customerName === 'JIMENEZ, RICARDO', 'uses PBS contact/vehicle info for names');
assert(inlineSlot!.vehicleLabel.includes('SANTA FE'), 'uses PBS vehicle info');

const oilAndRecall =
  'PERFORM FULL SYNTHETIC OIL & FILTER CHANGE PERFORMED RECALL 302 FRONT VIEW CAMERA';
assert(
  categorizeAppointmentBlock(oilAndRecall.toUpperCase()) === 'oilChange',
  'oil change takes priority over recall in combined concern text'
);

console.log('Verification PASSED — appointment schedule mapping');
console.log(JSON.stringify(slot, null, 2));
