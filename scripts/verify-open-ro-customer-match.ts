/**
 * Verifies Open RO customer name matching helpers.
 * Run: npx tsx scripts/verify-open-ro-customer-match.ts
 */
import {
  buildOpenRoNameKeys,
  indexCustomerNameKeys,
  resolveUniqueCustomerByName,
} from '../server/pbs/openRoCustomerMatch.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(
  buildOpenRoNameKeys('JARYN HEALEY').includes('jaryn healey'),
  'builds first-last key for PBS uppercase name'
);
assert(
  buildOpenRoNameKeys('OSCAR GARDUNO BAUTISTA').includes('oscar bautista'),
  'builds first-last key for multi-part PBS name'
);

const byName = new Map<string, string[]>();
const dataById = new Map<string, Record<string, unknown>>();
indexCustomerNameKeys(byName, 'cust-jaryn', 'Jaryn', 'Healey');
dataById.set('cust-jaryn', { firstName: 'Jaryn', lastName: 'Healey' });

const match = resolveUniqueCustomerByName(byName, 'JARYN HEALEY', dataById);
assert(match.customerId === 'cust-jaryn', 'matches PBS display name to CRM customer');

indexCustomerNameKeys(byName, 'cust-john-1', 'John', 'Smith');
indexCustomerNameKeys(byName, 'cust-john-2', 'John', 'Smith');
const ambiguous = resolveUniqueCustomerByName(byName, 'JOHN SMITH', dataById);
assert(!ambiguous.customerId, 'skips ambiguous duplicate names');

console.log('verify-open-ro-customer-match: OK');
