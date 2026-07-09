import { Customer } from '../types';
import { formatCustomerDisplayName } from './customerName';
import { DispatchRepairOrder } from '../types';

function normalizeNamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ');
}

/** Exact last-name match only (case-insensitive, normalized punctuation). */
export function findCustomersByLastName(customers: Customer[], lastName: string): Customer[] {
  const q = normalizeNamePart(lastName);
  if (!q) return [];

  return customers
    .filter((customer) => normalizeNamePart(customer.lastName || '') === q)
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
}

export function enrichDispatchFromCustomer(customer: Customer): Partial<DispatchRepairOrder> {
  return {
    customerId: customer.id,
    customerLastName: customer.lastName,
    customerName: formatCustomerDisplayName(customer.firstName, customer.lastName),
    phoneNumber: customer.phone,
    vinLastEight: customer.vinLast8,
    year: customer.year,
    model: customer.model,
  };
}

export function splitDispatchCustomerName(
  customerName?: string,
  customerLastName?: string
): { firstName: string; lastName: string } {
  const last = (customerLastName || '').trim();
  const full = (customerName || '').trim();

  if (last) {
    if (full && full.toLowerCase() !== last.toLowerCase()) {
      if (full.toLowerCase().endsWith(last.toLowerCase())) {
        return {
          firstName: full.slice(0, full.length - last.length).trim(),
          lastName: last,
        };
      }
      const parts = full.split(/\s+/);
      if (parts.length > 1 && parts[parts.length - 1].toLowerCase() === last.toLowerCase()) {
        return { firstName: parts.slice(0, -1).join(' '), lastName: last };
      }
    }
    return { firstName: full && full.toLowerCase() !== last.toLowerCase() ? full : '', lastName: last };
  }

  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: '', lastName: parts[0] || '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export function displayCustomerLastName(ro: DispatchRepairOrder): string {
  if (ro.customerLastName) return ro.customerLastName;
  if (ro.customerName) {
    const parts = ro.customerName.trim().split(/\s+/);
    if (parts.length) return parts[parts.length - 1];
  }
  return ro.vinLastEight ? `VIN …${ro.vinLastEight}` : 'Unknown';
}
