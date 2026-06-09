import { Customer } from '../types';
import { DispatchRepairOrder } from '../types';

function normalizeNamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ');
}

function lastNameMatchScore(customer: Customer, query: string): number {
  const ln = normalizeNamePart(customer.lastName || '');
  const full = normalizeNamePart(`${customer.firstName || ''} ${customer.lastName || ''}`);
  const tokens = ln.split(/[\s-]+/).filter(Boolean);

  if (!ln) return 0;
  if (ln === query) return 100;
  if (ln.startsWith(query)) return 80;
  if (tokens.some((token) => token.startsWith(query))) return 70;
  if (ln.includes(query)) return 60;
  if (full.includes(query)) return 40;
  return 0;
}

/** Match directory-style: partial last name, hyphenated names, and full-name fallback. */
export function findCustomersByLastName(customers: Customer[], lastName: string): Customer[] {
  const q = normalizeNamePart(lastName);
  if (q.length < 2) return [];

  return customers
    .map((customer) => ({ customer, score: lastNameMatchScore(customer, q) }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.customer.lastName || '').localeCompare(b.customer.lastName || '')
    )
    .map((row) => row.customer);
}

export function enrichDispatchFromCustomer(customer: Customer): Partial<DispatchRepairOrder> {
  return {
    customerId: customer.id,
    customerLastName: customer.lastName,
    customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
    phoneNumber: customer.phone,
    vinLastEight: customer.vinLast8,
    year: customer.year,
    model: customer.model,
  };
}

export function displayCustomerLastName(ro: DispatchRepairOrder): string {
  if (ro.customerLastName) return ro.customerLastName;
  if (ro.customerName) {
    const parts = ro.customerName.trim().split(/\s+/);
    if (parts.length) return parts[parts.length - 1];
  }
  return ro.vinLastEight ? `VIN …${ro.vinLastEight}` : 'Unknown';
}
