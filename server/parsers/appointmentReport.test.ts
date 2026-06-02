import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseAppointmentReportDeterministic,
  categorizeAppointmentServices,
} from './appointmentReport.js';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Sample categorization rules
assert(categorizeAppointmentServices('PERFORM FULL SYNTHETIC OIL & FILTER CHANGE') === 'oilChange', 'full synthetic');
assert(categorizeAppointmentServices('HYUNDAI COMPLIMENTARY MAINTENANCE') === 'oilChange', 'complimentary');
assert(
  categorizeAppointmentServices(
    'CUSTOMER STATES THE A/C DOES NOT WORK, PERFORM FULL SYNTHETIC OIL & FILTER CHANGE'
  ) === 'diagnosis',
  'customer states + oil → diagnosis'
);
assert(
  categorizeAppointmentServices('PERFORM FULL SYNTHETIC OIL & FILTER CHANGE , FRONT SEAT BELT ANC CLIP INS(2601-042H)') ===
    'recall',
  'oil + campaign → recall'
);
assert(categorizeAppointmentServices('CUSTOMER REQUEST TO DIAGNOSE A CHECK') === 'diagnosis', 'diag request');
assert(categorizeAppointmentServices('Brake Fluid Service') === 'misc', 'brake fluid misc');
assert(categorizeAppointmentServices('CUSTOMER REQUESTS US TO REPLACE OIL') === 'misc', 'generic replace oil');

const samplePath = join(process.cwd(), 'tmp-appt.txt');
const mondayPath = join(process.cwd(), 'tmp-monday-appt.txt');
for (const [label, filePath, expectedTotal] of [
  ['Monday sample', mondayPath, 19],
  ['Tuesday sample', samplePath, null as number | null],
] as const) {
  try {
    const text = readFileSync(filePath, 'utf8');
    const result = parseAppointmentReportDeterministic(text);
    if (expectedTotal != null) {
      assert(result.total === expectedTotal, `${label}: expected ${expectedTotal} appointments, got ${result.total}`);
    }
    assert(result.total === result.oilChange + result.diagnosis + result.recall + result.misc, `${label}: category sum mismatch`);
    console.log(`${label} parse OK:`, { total: result.total, oil: result.oilChange, diag: result.diagnosis, recall: result.recall, misc: result.misc });
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      console.log(`${label} not found — skipping`);
    } else {
      throw e;
    }
  }
}

console.log('appointmentReport parser tests passed');
