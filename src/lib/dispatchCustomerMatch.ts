import { Customer } from '../types';
import { DispatchRepairOrder } from '../types';

export function findCustomersByLastName(customers: Customer[], lastName: string): Customer[] {
  const q = lastName.trim().toLowerCase();
  if (!q) return [];

  return customers.filter((c) => {
    const ln = (c.lastName || '').toLowerCase();
    return ln === q || ln.startsWith(q);
  });
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
