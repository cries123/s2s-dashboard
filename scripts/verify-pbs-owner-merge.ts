/**
 * Verifies PBS owner-change merge logic.
 * Run: npx tsx scripts/verify-pbs-owner-merge.ts
 */
import { buildPbsCustomerUpdatePatch, dedupeContactVehiclesByVin } from '../server/pbs/pbsCustomerMerge.js';
import { mapContactVehicleToCustomerFields } from '../server/pbs/pbsMappers.js';
import type { PbsContactVehicle } from '../server/pbs/pbsTypes.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const older: PbsContactVehicle = {
  VehicleVIN: 'KMHD74LF1LU123456',
  ContactId: 'contact-old',
  ContactFirstName: 'Alice',
  ContactLastName: 'Original',
  ContactCellPhone: '8051111111',
  VehicleLastUpdate: '2024-01-01T00:00:00.0000000Z',
};

const newer: PbsContactVehicle = {
  VehicleVIN: 'KMHD74LF1LU123456',
  ContactId: 'contact-new',
  ContactFirstName: 'Bob',
  ContactLastName: 'Buyer',
  ContactCellPhone: '8052222222',
  VehicleLastUpdate: '2026-06-01T00:00:00.0000000Z',
};

const deduped = dedupeContactVehiclesByVin([older, newer]);
assert(deduped.length === 1, 'dedupe keeps one row per VIN');
assert(deduped[0].ContactId === 'contact-new', 'dedupe keeps newest PBS row');

const mapped = mapContactVehicleToCustomerFields(deduped[0], 'hyundai');
const existing = {
  firstName: 'Alice',
  lastName: 'Original',
  phone: '8051111111',
  pbsContactId: 'contact-old',
  lastContactOutcome: 'Left voicemail',
  serviceReminderDueDate: '2026-12-01',
};

const { patch, ownerChanged } = buildPbsCustomerUpdatePatch(existing, mapped, new Date().toISOString());
assert(ownerChanged, 'detects owner change');
assert(patch.firstName === 'Bob', 'overwrites first name from PBS');
assert(patch.lastName === 'Buyer', 'overwrites last name from PBS');
assert(patch.serviceReminderDueDate !== '2026-12-01', 'clears old owner reminder schedule');
assert(patch.pbsContactId === 'contact-new', 'stores new PBS contact id');

console.log('Verification PASSED — PBS owner merge behaves correctly');
