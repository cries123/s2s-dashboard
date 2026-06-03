import type { Customer } from '../types';

/** Match useCustomers / admin legacy Hyundai handling. */
export function customerMatchesDealership(
  customer: Customer,
  dealershipId: string
): boolean {
  if (dealershipId === 'hyundai') {
    return !customer.dealershipId || customer.dealershipId === 'hyundai';
  }
  return customer.dealershipId === dealershipId;
}
