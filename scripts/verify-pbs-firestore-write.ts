/**
 * Verifies PBS customer patches never contain undefined Firestore values.
 * Run: npx tsx scripts/verify-pbs-firestore-write.ts
 */
import { Timestamp } from 'firebase-admin/firestore';
import { mapContactVehicleToCustomerFields, mapPbsContactName } from '../server/pbs/pbsMappers.js';
import { stripUndefinedDeep } from '../server/pbs/pbsFirestore.js';
import type { PbsContactVehicle } from '../server/pbs/pbsTypes.js';

function findUndefinedPaths(value: unknown, path = ''): string[] {
  if (value === undefined) return [path || '(root)'];
  if (value === null || typeof value !== 'object') return [];
  if (value instanceof Timestamp || value instanceof Date) return [];

  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...findUndefinedPaths(item, `${path}[${i}]`)));
    return hits;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    hits.push(...findUndefinedPaths(child, childPath));
  }
  return hits;
}

function buildExistingCustomerPatch(existing: Record<string, unknown>, mapped: Record<string, unknown>, startedAt: string) {
  return stripUndefinedDeep({
    ...mapped,
    enableServiceAlert: existing.enableServiceAlert ?? mapped.enableServiceAlert,
    serviceAlertTriggered: existing.serviceAlertTriggered ?? false,
    serviceReminderDueDate: existing.serviceReminderDueDate,
    serviceAlertIntervalDays: existing.serviceAlertIntervalDays,
    serviceAlertBufferDays: existing.serviceAlertBufferDays,
    serviceAlertOverrideDate: existing.serviceAlertOverrideDate,
    stopAlertInfo: existing.stopAlertInfo,
    notes: existing.notes,
    soldByUserId: existing.soldByUserId,
    soldByUsername: existing.soldByUsername,
    lastContactOutcome: existing.lastContactOutcome,
    lastContactUserId: existing.lastContactUserId,
    lastContactUsername: existing.lastContactUsername,
    lastAcknowledgedCycle: existing.lastAcknowledgedCycle ?? 0,
    addedBy: existing.addedBy,
    addedByUsername: existing.addedByUsername,
    createdAt: existing.createdAt,
    pbsSyncedAt: startedAt,
  });
}

const sampleCv = {
  ContactFirstName: 'Jane',
  ContactLastName: 'Doe',
  ContactCellPhone: '8055551234',
  ContactEmailAddress: 'jane@example.com',
  VehicleVIN: 'KMHD74LF1LU123456',
  VehicleMake: 'Hyundai',
  VehicleModel: 'Elantra',
  VehicleYear: '2020',
  VehicleOdometer: 42000,
  ContactId: 'C1',
  VehicleId: 'V1',
} as PbsContactVehicle;

const mapped = mapContactVehicleToCustomerFields(sampleCv, 'hyundai');
const existingWithoutReminder = {
  enableServiceAlert: true,
  serviceAlertTriggered: false,
  createdAt: Timestamp.now(),
  addedBy: 'manual',
};

const existingWithNullReminder = {
  ...existingWithoutReminder,
  serviceReminderDueDate: null,
};

const startedAt = new Date().toISOString();
const patchA = buildExistingCustomerPatch(existingWithoutReminder, mapped, startedAt);
const patchB = buildExistingCustomerPatch(existingWithNullReminder, mapped, startedAt);
const newPayload = stripUndefinedDeep({
  ...mapped,
  addedBy: 'pbs-sync',
  addedByUsername: 'PBS Sync',
  createdAt: Timestamp.now(),
  pbsSyncedAt: startedAt,
});

const cases = [
  ['existing update without serviceReminderDueDate', patchA],
  ['existing update with null serviceReminderDueDate', patchB],
  ['new customer payload', newPayload],
];

let failed = false;
for (const [label, payload] of cases) {
  const undefinedPaths = findUndefinedPaths(payload);
  const hasServiceReminderUndefined = 'serviceReminderDueDate' in payload && payload.serviceReminderDueDate === undefined;
  console.log(`\n${label}:`);
  console.log(`  keys: ${Object.keys(payload).length}`);
  console.log(`  serviceReminderDueDate present: ${'serviceReminderDueDate' in payload}`);
  console.log(`  undefined paths: ${undefinedPaths.length ? undefinedPaths.join(', ') : '(none)'}`);

  if (undefinedPaths.length > 0 || hasServiceReminderUndefined) {
    failed = true;
    console.log('  RESULT: FAIL');
  } else {
    console.log('  RESULT: OK');
  }
}

// Simulate pre-fix behavior to confirm we reproduce the reported error shape.
const buggyPatch = {
  ...mapped,
  serviceReminderDueDate: undefined as string | undefined,
};
const buggyUndefined = findUndefinedPaths(buggyPatch);
console.log('\nPre-fix reproduction (intentionally buggy):');
console.log(`  undefined paths: ${buggyUndefined.join(', ') || '(none)'}`);
if (!buggyUndefined.includes('serviceReminderDueDate')) {
  failed = true;
  console.log('  RESULT: FAIL — could not reproduce original bug');
} else {
  console.log('  RESULT: OK — reproduces serviceReminderDueDate undefined');
}

if (failed) {
  console.error('\nVerification FAILED');
  process.exit(1);
}

// Simulate Firestore batch.set validation (same failure mode as firebase-admin).
class MockBatch {
  set(_ref: unknown, data: unknown) {
    const paths = findUndefinedPaths(data);
    if (paths.length > 0) {
      throw new Error(
        `Cannot use "undefined" as a Firestore value (found in field "${paths[0]}")`
      );
    }
  }
}

const batch = new MockBatch();
for (const [label, payload] of cases) {
  try {
    batch.set({}, payload);
    console.log(`mock batch.set (${label}): OK`);
  } catch (err) {
    failed = true;
    console.error(`mock batch.set (${label}): FAIL — ${err instanceof Error ? err.message : err}`);
  }
}

if (failed) {
  console.error('\nVerification FAILED');
  process.exit(1);
}

import { mapPbsContactName } from '../server/pbs/pbsMappers.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(
  mapPbsContactName({ ContactLastName: 'DUBLIN HYUNDAI' }).firstName === '',
  'business last-name-only has empty firstName'
);
assert(
  mapPbsContactName({ ContactLastName: 'DUBLIN HYUNDAI' }).lastName === 'DUBLIN HYUNDAI',
  'business last-name-only keeps lastName'
);
assert(
  mapPbsContactName({ ContactFirstName: 'Unknown', ContactLastName: 'DUBLIN HYUNDAI' }).firstName === '',
  'strips Unknown first name'
);

console.log('Verification PASSED — PBS customer writes are Firestore-safe');
