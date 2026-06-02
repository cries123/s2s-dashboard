import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseAppointmentReportDeterministic,
  categorizeAppointmentService,
} from './appointmentReport.js';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Sample categorization rules
assert(categorizeAppointmentService('PERFORM FULL SYNTHETIC OIL & FILTER CHANGE') === 'oilChange', 'full synthetic');
assert(categorizeAppointmentService('HYUNDAI COMPLIMENTARY MAINTENANCE') === 'oilChange', 'complimentary');
assert(
  categorizeAppointmentService(
    'CUSTOMER STATES THE A/C DOES NOT WORK, PERFORM FULL SYNTHETIC OIL & FILTER CHANGE'
  ) === 'diagnosis',
  'customer states + oil → diagnosis'
);
assert(
  categorizeAppointmentService('PERFORM FULL SYNTHETIC OIL & FILTER CHANGE , FRONT SEAT BELT ANC CLIP INS(2601-042H)') ===
    'recall',
  'oil + campaign → recall'
);
assert(categorizeAppointmentService('CUSTOMER REQUEST TO DIAGNOSE A CHECK') === 'diagnosis', 'diag request');
assert(categorizeAppointmentService('Brake Fluid Service') === 'misc', 'brake fluid misc');
assert(categorizeAppointmentService('CUSTOMER REQUESTS US TO REPLACE OIL') === 'misc', 'generic replace oil');

const samplePath = join(process.cwd(), 'tmp-appt.txt');
try {
  const text = readFileSync(samplePath, 'utf8');
  const result = parseAppointmentReportDeterministic(text);
  assert(result.total === 19, `expected 19 appointments, got ${result.total}`);
  assert(result.recall === 2, `expected 2 recalls, got ${result.recall}`);
  assert(result.oilChange === 9, `expected 9 oil changes, got ${result.oilChange}`);
  assert(result.diagnosis === 2, `expected 2 diagnosis, got ${result.diagnosis}`);
  assert(result.misc === 6, `expected 6 misc, got ${result.misc}`);
  console.log('Sample PDF parse OK:', result);
} catch (e: any) {
  if (e.code === 'ENOENT') {
    console.log('tmp-appt.txt not found — skipping integration sample (unit asserts passed)');
  } else {
    throw e;
  }
}

console.log('appointmentReport parser tests passed');
